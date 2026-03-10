import "package:flutter_secure_dotenv/flutter_secure_dotenv.dart";

part "example_secure_env.g.dart";

@DotEnvGen(
  filename: ".env.secure_demo",
  fieldRename: FieldRename.screamingSnake,
)
abstract class ExampleSecureEnv {
  static const _encryptionKey = "3D0xOo+/qJN6CiAWTXIXCryC1vKB8TSvkO45aiN2HFA=";
  static const _iv = "1kPHE8gtNT+SEGU/MOtu1Q==";
  static ExampleSecureEnv create() {
    return ExampleSecureEnv(_encryptionKey, _iv);
  }

  const factory ExampleSecureEnv(String encryptionKey, String iv) =
      _$ExampleSecureEnv;

  const ExampleSecureEnv._();

  @FieldKey(defaultValue: "https://api.example.local")
  String get apiBaseUrl;

  @FieldKey(defaultValue: "wss://api.example.local/ws")
  String get apiWebSocketUrl;

  @FieldKey(defaultValue: true)
  bool get featureFlag;

  @FieldKey(defaultValue: 8000)
  int get requestTimeoutMs;
}
