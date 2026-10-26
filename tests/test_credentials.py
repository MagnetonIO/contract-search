import contextlib
import io
import os
import subprocess
import types
import unittest
from unittest.mock import Mock, patch

import credentials as c
from scripts import configure_token as setup


class CredentialTests(unittest.TestCase):
    @patch.dict(os.environ, {'APIFY_TOKEN': ' environment-value '})
    @patch('credentials.secure_backend')
    def test_environment_override_does_not_open_vault(self, backend):
        self.assertEqual(c.load_token(), 'environment-value')
        backend.assert_not_called()

    @patch.dict(os.environ, {}, clear=True)
    @patch('credentials.subprocess.run')
    @patch('credentials.secure_backend')
    def test_native_store_on_every_platform(self, backend, command):
        backend.return_value.get_password.return_value = 'native-value'
        for platform in ['darwin', 'linux', 'win32']:
            with self.subTest(platform=platform), patch('credentials.sys.platform', platform):
                self.assertEqual(c.load_token(), 'native-value')
        command.assert_not_called()

    @patch.dict(os.environ, {}, clear=True)
    @patch('credentials.subprocess.run')
    @patch('credentials.secure_backend', side_effect=c.CredentialError('No native vault'))
    def test_headless_hosts_need_no_macos_command(self, backend, command):
        for platform in ['linux', 'win32']:
            with self.subTest(platform=platform), patch('credentials.sys.platform', platform):
                self.assertEqual(c.load_token(), '')
        command.assert_not_called()

    @patch.dict(os.environ, {}, clear=True)
    @patch('credentials.sys.platform', 'darwin')
    @patch('credentials.subprocess.run')
    @patch('credentials.secure_backend', side_effect=c.CredentialError('No native vault'))
    def test_original_mac_credential_still_loads(self, backend, command):
        command.return_value = subprocess.CompletedProcess([], 0, stdout='legacy-value\n')
        self.assertEqual(c.load_token(), 'legacy-value')
        self.assertIn('security', command.call_args.args[0])

    def test_native_backends_selected_and_plaintext_rejected(self):
        for module in c.NATIVE_BACKENDS:
            backend = type('Backend', (), {'__module__': module})()
            with patch.dict('sys.modules', {'keyring': types.SimpleNamespace(get_keyring=lambda: backend)}):
                self.assertIs(c.secure_backend(), backend)
        plaintext = type('Plaintext', (), {'__module__': 'keyrings.alt.file'})()
        with patch.dict('sys.modules', {'keyring': types.SimpleNamespace(get_keyring=lambda: plaintext)}):
            with self.assertRaises(c.CredentialError):
                c.secure_backend()

    @patch('credentials.secure_backend')
    def test_save_error_never_repeats_credential(self, backend):
        backend.return_value.set_password.side_effect = RuntimeError('sensitive-value')
        with self.assertRaises(c.CredentialError) as error:
            c.save_token('sensitive-value')
        self.assertNotIn('sensitive-value', str(error.exception))


class SetupTests(unittest.TestCase):
    @patch('scripts.configure_token.getpass.getpass', return_value='fake-value')
    @patch('scripts.configure_token.fetch')
    @patch('scripts.configure_token.save_token')
    @patch('scripts.configure_token.subprocess.run', side_effect=FileNotFoundError)
    def test_local_setup_works_without_github_cli(self, command, save, fetch, prompt):
        with contextlib.redirect_stdout(io.StringIO()) as output:
            setup.main([])
        save.assert_called_once_with('fake-value')
        self.assertIn('Local setup complete', output.getvalue())
        self.assertNotIn('fake-value', output.getvalue())
        self.assertEqual(command.call_args.kwargs['input'], 'fake-value')
        self.assertNotIn('fake-value', command.call_args.args[0])

    @patch('scripts.configure_token.getpass.getpass', return_value='fake-value')
    @patch('scripts.configure_token.fetch')
    @patch('scripts.configure_token.save_token')
    @patch('scripts.configure_token.subprocess.run')
    def test_local_only_never_syncs_github(self, command, save, fetch, prompt):
        with contextlib.redirect_stdout(io.StringIO()):
            setup.main(['--local-only'])
        command.assert_not_called()
        save.assert_called_once_with('fake-value')

    @patch('scripts.configure_token.getpass.getpass', return_value='fake-value')
    @patch('scripts.configure_token.fetch', side_effect=setup.SourceError('HTTP 401'))
    @patch('scripts.configure_token.save_token')
    def test_invalid_credential_is_not_saved(self, save, fetch, prompt):
        with self.assertRaises(SystemExit):
            setup.main([])
        save.assert_not_called()

    @patch('scripts.configure_token.getpass.getpass', side_effect=setup.getpass.GetPassWarning)
    @patch('scripts.configure_token.save_token')
    def test_noninteractive_entry_refuses_echo(self, save, prompt):
        with self.assertRaises(SystemExit):
            setup.main([])
        save.assert_not_called()


if __name__ == '__main__':
    unittest.main()
