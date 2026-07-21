from passlib.hash import pbkdf2_sha512


class FilterModule:
    def filters(self):
        return {
            "authelia_client_secret_hash": self.authelia_client_secret_hash,
        }

    @staticmethod
    def authelia_client_secret_hash(secret, salt):
        return pbkdf2_sha512.using(salt=salt.encode(), rounds=310000).hash(secret)
