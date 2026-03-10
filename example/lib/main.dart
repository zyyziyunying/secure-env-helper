import "package:flutter/material.dart";

import "secure_env/example_secure_env.dart";

void main() {
  final env = ExampleSecureEnv.create();
  runApp(ExampleApp(env: env));
}

class ExampleApp extends StatelessWidget {
  const ExampleApp({super.key, required this.env});

  final ExampleSecureEnv env;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        body: Center(
          child: Text(
            [
              "apiBaseUrl=${env.apiBaseUrl}",
              "apiWebSocketUrl=${env.apiWebSocketUrl}",
              "featureFlag=${env.featureFlag}",
              "requestTimeoutMs=${env.requestTimeoutMs}",
            ].join("\n"),
            textAlign: TextAlign.center,
          ),
        ),
      ),
    );
  }
}
