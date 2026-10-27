"""Process environment overrides or native OS credential storage for collector keys."""
import getpass
import os
import subprocess
import sys

SERVICE = 'contract-search'
ACCOUNT = 'APIFY_TOKEN'
NATIVE_BACKENDS = ('keyring.backends.macOS', 'keyring.backends.Windows',
                   'keyring.backends.SecretService', 'keyring.backends.kwallet')


class CredentialError(Exception):
    pass


def secure_backend():
    """Select a native vault, never an optional plaintext file backend."""
    try:
        import keyring
        backend = keyring.get_keyring()
        candidates = getattr(backend, 'backends', [backend])
        for candidate in candidates:
            if type(candidate).__module__.startswith(NATIVE_BACKENDS):
                return candidate
    except Exception:
        pass
    raise CredentialError('No native credential store is available. Install requirements.txt '
                          'and enable the OS credential store, or supply the collector key in '
                          'the process environment on headless hosts.')


def load_secret(account):
    token = os.environ.get(account, '').strip()
    if token:
        return token
    try:
        token = secure_backend().get_password(SERVICE, account)
        if token and token.strip():
            return token.strip()
    except Exception:
        pass
    # Preserve the credential saved by the original macOS setup.
    if account == ACCOUNT and sys.platform == 'darwin':
        try:
            result = subprocess.run(['security', 'find-generic-password', '-a', getpass.getuser(),
                                     '-s', ACCOUNT, '-w'], capture_output=True, text=True)
            if result.returncode == 0:
                return result.stdout.strip()
        except OSError:
            pass
    return ''


def load_token():
    return load_secret(ACCOUNT)


def save_secret(account, token):
    if not token.strip():
        raise CredentialError('No token entered.')
    backend = secure_backend()
    try:
        backend.set_password(SERVICE, account, token.strip())
    except Exception:
        raise CredentialError('Credential store save failed. Unlock the OS credential '
                              'store or supply the key in the process environment.') from None


def save_token(token):
    save_secret(ACCOUNT, token)
