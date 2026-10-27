import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from scripts import configure_email as setup


class EmailSetupTests(unittest.TestCase):
    @patch('sys.stdout', new_callable=io.StringIO)
    @patch('getpass.getpass', return_value='re_synthetic_setup_test_only')
    @patch('scripts.configure_email.urlopen')
    def test_hidden_setup_uses_explicit_client_and_does_not_echo_key(self, urlopen, getpass, output):
        response = urlopen.return_value.__enter__.return_value
        response.read.return_value = b'{"id":"synthetic-receipt"}'
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(setup, 'ROOT', Path(directory)), patch('sys.argv', ['configure_email.py', '--local-only']):
                setup.main()
            saved = json.loads((Path(directory)/'web/.local/mail.json').read_text(encoding='utf-8'))
            self.assertEqual(saved['apiKey'], 're_synthetic_setup_test_only')
        request = urlopen.call_args.args[0]
        self.assertEqual(request.get_header('User-agent'), 'ContractDesk/1.0')
        self.assertEqual(json.loads(request.data)['to'], ['mlong@magneton.io'])
        self.assertNotIn('re_synthetic_setup_test_only', output.getvalue())

    @patch('getpass.getpass', return_value='re_synthetic_setup_test_only')
    @patch('scripts.configure_email.urlopen')
    @patch('sys.stdout', new_callable=io.StringIO)
    def test_provider_error_redacts_key_and_saves_nothing(self, output, urlopen, getpass):
        urlopen.side_effect = HTTPError('https://api.resend.com/emails',403,'Forbidden',{},io.BytesIO(b'{"message":"Denied re_synthetic_setup_test_only"}'))
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(setup,'ROOT',Path(directory)), patch('sys.argv',['configure_email.py','--local-only']):
                with self.assertRaises(SystemExit) as raised:
                    setup.main()
            self.assertIn('[REDACTED]',str(raised.exception))
            self.assertNotIn('re_synthetic_setup_test_only',str(raised.exception))
            self.assertFalse((Path(directory)/'web/.local/mail.json').exists())


if __name__ == '__main__':
    unittest.main()
