import sqlite3
import tempfile
import unittest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backup_db import backup

class BackupTests(unittest.TestCase):
    def test_backup_consistente_wal(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root/'live.db'
            destination = root/'backups'/'copy.db'
            connection = sqlite3.connect(source)
            connection.execute('PRAGMA journal_mode=WAL')
            connection.execute('CREATE TABLE stock(id INTEGER PRIMARY KEY, cantidad INTEGER)')
            connection.execute('INSERT INTO stock VALUES(1,25)')
            connection.commit()
            backup(source, destination)
            with sqlite3.connect(destination) as copy:
                self.assertEqual(copy.execute('SELECT cantidad FROM stock').fetchone()[0], 25)
                self.assertEqual(copy.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
            connection.close()

    def test_no_sobrescribir(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory)/'original.db'
            with sqlite3.connect(source) as conn:
                conn.execute('CREATE TABLE x(id INTEGER)')
            with self.assertRaises(ValueError):
                backup(source, source)
            destination = Path(directory)/'copy.db'
            backup(source, destination)
            with self.assertRaises(FileExistsError):
                backup(source, destination)

    def test_falla_si_no_existe(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(FileNotFoundError):
                backup(Path(directory)/'missing.db', Path(directory)/'copy.db')

if __name__ == '__main__':
    unittest.main()
