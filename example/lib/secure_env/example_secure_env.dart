import "package:flutter_secure_dotenv/flutter_secure_dotenv.dart";

part "example_secure_env.g.dart";

@DotEnvGen(
  filename: ".env.secure_demo",
  fieldRename: FieldRename.screamingSnake,
)
abstract class ExampleSecureEnv {
  static const _encryptionKey = "YOUR_BASE64_ENCRYPTION_KEY";
  static const _iv = "YOUR_BASE64_IV";
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
