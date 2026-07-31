package com.daniewatch.daniewatch_app

import android.content.Intent
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity: FlutterActivity() {
    private val CHANNEL = "com.daniewatch/share"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            if (call.method == "shareText") {
                val text = call.argument<String>("text")
                if (!text.isNullOrEmpty()) {
                    shareText(text)
                    result.success(true)
                } else {
                    result.error("INVALID_TEXT", "Text cannot be empty", null)
                }
            } else {
                result.notImplemented()
            }
        }
    }

    private fun shareText(text: String) {
        val sendIntent = Intent().apply {
            action = Intent.ACTION_SEND
            putExtra(Intent.EXTRA_TEXT, text)
            type = "text/plain"
        }
        val shareIntent = Intent.createChooser(sendIntent, "Share Download Link")
        startActivity(shareIntent)
    }
}
