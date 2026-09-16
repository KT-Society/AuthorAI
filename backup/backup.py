#!/usr/bin/env python3
"""
Secure Backup-Skript für den EchoForge Studio Workspace
Erstellt ein .rar- oder .zip-Archiv des Workspace-Inhalts mit automatischem Ausschluss
von Monorepo-Build-Outputs, Caches, Modellen, node_modules und temporären Dateien.
"""

import os
import sys
import time
import shutil
import tempfile
import json
import argparse
from contextlib import suppress, contextmanager
from pathlib import Path
from datetime import datetime
import subprocess
import logging
import re

# Logging konfigurieren
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)

SCRIPT_DIR = Path(__file__).resolve().parent
WORKSPACE_DIR = SCRIPT_DIR.parent


def sanitize_log_input(text):
    """Sanitisiert Input für sicheres Logging"""
    if not isinstance(text, str):
        text = str(text)
    # Entferne/ersetze gefährliche Zeichen
    return re.sub(r'[\r\n\t]', '_', text)


class WorkspaceBackup:
    def __init__(self, workspace_path=None):
        # Sichere Pfad-Validierung
        if workspace_path is None:
            workspace_path = WORKSPACE_DIR
        self.workspace_path = Path(workspace_path).resolve()
        if not self._is_safe_path(self.workspace_path):
            raise ValueError(f"Unsicherer Workspace-Pfad: {workspace_path}")

        self.backup_dir = (self.workspace_path / "backup").resolve()

        # Vollständige Ausschlüsse für Monorepo-Builds, Dependencies & Caches
        self.excluded_dirs = {
            'node_modules',
            '.turbo',
            '.build'
        }

        self.excluded_extensions = {
            '.rar', '.zip'
        }

        # Sicherstellen, dass der Backup-Ordner existiert
        self.backup_dir.mkdir(exist_ok=True)

    def _is_safe_path(self, path):
        """Validiert Pfad gegen Directory Traversal"""
        try:
            path = path.resolve()
            path_str = str(path)
            return '..' not in path.parts and not path_str.startswith('\\\\')
        except (OSError, ValueError):
            return False

    def should_exclude(self, path):
        """Prüft, ob ein Pfad ausgeschlossen werden soll"""
        path_parts_lower = set(part.lower() for part in path.parts)

        # Prüfe ob ein ausgeschlossener Verzeichnisname im Pfad enthalten ist
        if path_parts_lower.intersection(self.excluded_dirs):
            return True

        # backup.py selbst immer im Backup behalten
        if path.name.lower() == 'backup.py':
            return False

        # Ausschluss von Archiv- und Temporärdateien
        return path.suffix.lower() in self.excluded_extensions

    def get_file_list_optimized(self):
        """Optimierte Dateilisten-Erstellung mit os.scandir()"""
        files_to_backup = []
        total_size = 0

        logging.info(f"Scanne Workspace: {sanitize_log_input(str(self.workspace_path))}")

        def scan_directory(dir_path):
            nonlocal total_size
            try:
                with os.scandir(dir_path) as entries:
                    for entry in entries:
                        entry_path = Path(entry.path)
                        if entry.is_dir():
                            name_lower = entry.name.lower()
                            # Überspringe ausgeschlossene Ordner
                            if name_lower in self.excluded_dirs:
                                continue
                            # Überspringe den Ziel-Backup-Ordner
                            if entry_path.resolve() == self.backup_dir:
                                continue
                            # Rekursiver Aufruf
                            scan_directory(entry.path)
                        elif entry.is_file():
                            if self.should_exclude(entry_path):
                                continue

                            files_to_backup.append(str(entry_path))
                            with suppress(OSError):
                                total_size += entry.stat().st_size
            except OSError as e:
                logging.warning(f"Fehler beim Scannen von {sanitize_log_input(str(dir_path))}: {sanitize_log_input(str(e))}")

        scan_directory(self.workspace_path)

        logging.info(f"Gefunden: {len(files_to_backup)} Dateien, Gesamtgröße: {total_size / (1024*1024):.2f} MB")
        return files_to_backup

    def find_rar_executable(self):
        """Sucht nach WinRAR/RAR-Installation"""
        if rar_cmd := shutil.which("rar") or shutil.which("winrar"):
            logging.info(f"RAR in PATH gefunden: {sanitize_log_input(rar_cmd)}")
            return rar_cmd

        # Fallback zu Standard-Installationspfaden
        possible_paths = [
            "C:\\Program Files\\WinRAR\\WinRAR.exe",
            "C:\\Program Files (x86)\\WinRAR\\WinRAR.exe",
            "C:\\Program Files\\WinRAR\\Rar.exe",
            "C:\\Program Files (x86)\\WinRAR\\Rar.exe",
            "/usr/bin/rar",
            "/usr/local/bin/rar"
        ]

        for path in possible_paths:
            if os.path.exists(path):
                logging.info(f"WinRAR/RAR gefunden: {sanitize_log_input(path)}")
                return path

        return None

    @contextmanager
    def temp_file_list(self, files):
        """Context Manager für temporäre Dateiliste"""
        temp_file = None
        try:
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8',
                                           suffix='.txt', delete=False) as f:
                temp_file = f.name
                for file_path in files:
                    try:
                        rel_path = os.path.relpath(file_path, self.workspace_path)
                        rel_path = rel_path.replace('\\', '/')
                        f.write(f"{rel_path}\n")
                    except ValueError:
                        continue
            yield temp_file
        finally:
            if temp_file and os.path.exists(temp_file):
                with suppress(OSError):
                    os.unlink(temp_file)

    def _execute_rar_command(self, cmd, cwd, timeout=3600):
        """Sichere subprocess-Ausführung"""
        try:
            logging.info(f"Führe Kommando aus: {sanitize_log_input(' '.join(cmd))}")

            return subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=cwd,
                shell=False,
            )
        except subprocess.TimeoutExpired:
            logging.error("Prozess-Timeout erreicht")
            return None
        except Exception as e:
            logging.error(f"Subprocess-Fehler: {sanitize_log_input(str(e))}")
            return None

    def create_rar_backup_winrar(self, rar_exe, backup_path):
        """Erstellt Backup mit WinRAR/RAR"""
        try:
            files = self.get_file_list_optimized()

            with self.temp_file_list(files) as file_list_path:
                logging.info(f"Temporäre Dateiliste: {sanitize_log_input(file_list_path)}")

                cmd = [
                    rar_exe,
                    "a",  # Add to archive
                    "-r",  # Recurse subdirectories
                    "-m5",  # Maximum compression
                    str(backup_path),
                    f"@{file_list_path}"
                ]

                result = self._execute_rar_command(cmd, self.workspace_path)

                if result and result.returncode == 0:
                    if backup_path.exists():
                        size_mb = backup_path.stat().st_size / (1024*1024)
                        logging.info(f"Backup erfolgreich: {sanitize_log_input(str(backup_path))}, Größe: {size_mb:.2f} MB")
                        return True
                    else:
                        logging.error("Backup-Datei nicht gefunden")
                        return False
                else:
                    if result:
                        logging.error(f"WinRAR-Fehler (Code: {result.returncode})")
                        logging.error(f"Stderr: {sanitize_log_input(result.stderr)}")
                    return False

        except Exception as e:
            logging.error(f"Backup-Fehler: {sanitize_log_input(str(e))}")
            return False

    def get_version(self):
        """Liest die Versionsnummer aus CHANGELOG.md oder package.json"""
        # 1. Versuche aus CHANGELOG.md zu lesen
        try:
            changelog_path = self.workspace_path / "CHANGELOG.md"
            if changelog_path.exists():
                with open(changelog_path, 'r', encoding='utf-8') as f:
                    content = f.read()

                match = re.search(r'##\s+\[v?(\d+\.\d+(?:\.\d+)?(?:-[a-zA-Z0-9.]+)?)]', content)
                if match:
                    version = match.group(1)
                    logging.info(f"Versionsnummer aus CHANGELOG.md gelesen: {version}")
                    return version
        except Exception as e:
            logging.warning(f"Fehler beim Lesen des CHANGELOG.md: {sanitize_log_input(str(e))}")

        # 2. Fallback: package.json im Workspace-Root lesen
        try:
            pkg_path = self.workspace_path / "package.json"
            if pkg_path.exists():
                with open(pkg_path, 'r', encoding='utf-8') as f:
                    pkg_data = json.load(f)
                if version := pkg_data.get("version"):
                    logging.info(f"Versionsnummer aus package.json gelesen: {version}")
                    return str(version)
        except Exception as e:
            logging.warning(f"Fehler beim Lesen der package.json: {sanitize_log_input(str(e))}")

        logging.warning("Keine Versionsnummer gefunden. Standard: 1.0.0")
        return "1.0.0"

    def get_backup_format_choice(self, default_format=None):
        """Fragt den Benutzer nach dem gewünschten Backup-Format (oder nutzt CLI-Default)"""
        if default_format in {"rar", "zip"}:
            return default_format

        # Falls nicht interaktiv, nutze zip als Standard
        if not sys.stdin.isatty():
            logging.info("Nicht-interaktive Shell erkannt. Wähle standardmäßig ZIP.")
            return "zip"

        print("\n" + "="*50)
        print("BACKUP-FORMAT AUSWÄHLEN")
        print("="*50)
        print("1. RAR (empfohlen - bessere Kompression)")
        print("2. ZIP (universell kompatibel)")
        print("="*50)

        while True:
            try:
                choice = input("Wähle Format (1 oder 2): ").strip()
                if choice == "1":
                    return "rar"
                elif choice == "2":
                    return "zip"
                else:
                    print("❌ Ungültige Auswahl! Bitte wähle 1 oder 2.")
            except KeyboardInterrupt:
                print("\n❌ Abgebrochen!")
                return None
            except EOFError:
                logging.info("Eingabe-Ende erreicht. Wähle standardmäßig ZIP.")
                return "zip"

    def create_backup(self, default_format=None):
        """Erstellt das Backup im gewählten Format"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        # Versionsnummer automatisch ermitteln
        version = self.get_version()

        # Versionsnummer für Dateinamen formatieren (Punkte/Striche entfernen: 1.0.0 -> 100)
        version_for_filename = re.sub(r'[^a-zA-Z0-9]', '', version)

        # Format ermitteln
        format_choice = self.get_backup_format_choice(default_format)
        if not format_choice:
            logging.error("Kein Backup-Format gewählt. Abgebrochen.")
            return False

        # Dateiname im Format: WORKSPACE_v100_backup_20260807_013000.zip
        backup_name = f"WORKSPACE_v{version_for_filename}_backup_{timestamp}.{format_choice}"
        backup_path = self.backup_dir / backup_name

        if format_choice == "rar":
            logging.info(f"Erstelle RAR-Backup: {sanitize_log_input(backup_name)}")
            rar_exe = self.find_rar_executable()
            if not rar_exe:
                logging.warning("RAR/WinRAR nicht gefunden. Wechsle zu ZIP-Backup.")
                backup_name = f"WORKSPACE_v{version_for_filename}_backup_{timestamp}.zip"
                backup_path = self.backup_dir / backup_name
                return self.create_zip_backup_fallback(backup_path)

            return self.create_rar_backup_winrar(rar_exe, backup_path)

        else:  # zip
            logging.info(f"Erstelle ZIP-Backup: {sanitize_log_input(backup_name)}")
            return self.create_zip_backup_fallback(backup_path)

    def create_zip_backup_fallback(self, backup_path):
        """Fallback: ZIP-Backup mit Progress-Feedback"""
        try:
            import zipfile

            logging.info("Erstelle ZIP-Archiv...")
            files = self.get_file_list_optimized()

            with zipfile.ZipFile(backup_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zipf:
                for i, file_path in enumerate(files):
                    try:
                        rel_path = os.path.relpath(file_path, self.workspace_path)
                        zipf.write(file_path, rel_path)

                        # Progress-Feedback
                        if (i + 1) % 500 == 0 or (i + 1) == len(files):
                            progress = (i + 1) / len(files) * 100
                            logging.info(f"Fortschritt: {progress:.1f}% ({i + 1}/{len(files)})")

                    except Exception as e:
                        logging.warning(f"Datei übersprungen: {sanitize_log_input(str(e))}")
                        continue

            if backup_path.exists():
                size_mb = backup_path.stat().st_size / (1024*1024)
                logging.info(f"ZIP-Backup erfolgreich erstellt: {sanitize_log_input(backup_path.name)}, Größe: {size_mb:.2f} MB")
                return True
            return False

        except Exception as e:
            logging.error(f"ZIP-Backup-Fehler: {sanitize_log_input(str(e))}")
            return False

    def cleanup_old_backups(self, keep_count=50):
        """Bereinigt alte Backups, behält die neuesten 'keep_count' Dateien"""
        try:
            backup_files = []
            with os.scandir(self.backup_dir) as entries:
                backup_files.extend(
                    (Path(entry.path), entry.stat().st_mtime)
                    for entry in entries
                    if entry.is_file() and entry.name.lower().endswith(('.rar', '.zip', '.7z', '.tar.gz'))
                )
            if len(backup_files) <= keep_count:
                return

            # Sortiere nach Änderungsdatum (neueste zuerst)
            backup_files.sort(key=lambda x: x[1], reverse=True)

            # Lösche alte Backups
            for backup_path, _ in backup_files[keep_count:]:
                try:
                    backup_path.unlink()
                    logging.info(f"Altes Backup gelöscht: {sanitize_log_input(backup_path.name)}")
                except Exception as e:
                    logging.warning(f"Löschfehler: {sanitize_log_input(str(e))}")

        except Exception as e:
            logging.error(f"Bereinigungsfehler: {sanitize_log_input(str(e))}")

    def run_backup(self, default_format=None):
        """Führt den kompletten Backup-Prozess aus"""
        start_time = time.time()

        logging.info("=== WORKSPACE BACKUP STARTET ===")
        logging.info(f"Workspace: {sanitize_log_input(str(self.workspace_path))}")

        try:
            if self.create_backup(default_format):
                self.cleanup_old_backups()

                elapsed_time = time.time() - start_time
                logging.info(f"=== BACKUP ERFOLGREICH ({elapsed_time:.2f}s) ===")
                return True
            else:
                logging.error("=== BACKUP FEHLGESCHLAGEN ===")
                return False

        except Exception as e:
            logging.error(f"=== UNERWARTETER FEHLER: {sanitize_log_input(str(e))} ===")
            return False


def main():
    """Hauptfunktion"""
    parser = argparse.ArgumentParser(description="Secure Backup-Skript für den EchoForge Studio Workspace")
    parser.add_argument("--format", choices=["rar", "zip"], help="Das gewünschte Backup-Format")
    args = parser.parse_args()

    try:
        backup = WorkspaceBackup()

        if not backup.workspace_path.exists():
            logging.error(f"Workspace-Pfad existiert nicht: {backup.workspace_path}")
            return 1

        success = backup.run_backup(args.format)
        return 0 if success else 1

    except Exception as e:
        logging.error(f"Initialisierungsfehler: {sanitize_log_input(str(e))}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
