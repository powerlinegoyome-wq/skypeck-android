package com.skypeck.tv

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient

class MainActivity : Activity() {

    private lateinit var webView: WebView
    private var udpServer: UdpServer? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 1. Force 1080p Fixed Immersive Fullscreen (No Status/Nav Bar, Keep Screen On)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        hideSystemUI()

        // 2. Hardware Accelerated WebView
        webView = WebView(this)
        setContentView(webView)

        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.loadWithOverviewMode = true
        settings.useWideViewPort = true
        settings.setSupportZoom(false)
        settings.cacheMode = WebSettings.LOAD_NO_CACHE

        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null)
        webView.webViewClient = WebViewClient()
        webView.webChromeClient = WebChromeClient()

        // Load 1080p Offline Game
        webView.loadUrl("file:///android_asset/www/index.html")

        // 3. Start Native UDP Auto-Discovery & Telemetry Server on Port 9876
        udpServer = UdpServer(port = 9876) { jsonPacket ->
            runOnUiThread {
                // Pass directly into Three.js 1080p engine with zero overhead
                val escaped = jsonPacket.replace("'", "\\'")
                webView.evaluateJavascript("window.onUdpTelemetry('$escaped')", null)
            }
        }
        udpServer?.start()
    }

    override fun onResume() {
        super.onResume()
        hideSystemUI()
    }

    private fun hideSystemUI() {
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_FULLSCREEN
        )
    }

    // 4. TV Remote Controller Key Handling
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        when (keyCode) {
            KeyEvent.KEYCODE_DPAD_CENTER,
            KeyEvent.KEYCODE_ENTER,
            KeyEvent.KEYCODE_BUTTON_A -> {
                webView.evaluateJavascript("window.onRemoteKey('FLAP')", null)
                return true
            }
            KeyEvent.KEYCODE_DPAD_LEFT -> {
                webView.evaluateJavascript("window.onRemoteKey('LEFT')", null)
                return true
            }
            KeyEvent.KEYCODE_DPAD_RIGHT -> {
                webView.evaluateJavascript("window.onRemoteKey('RIGHT')", null)
                return true
            }
            KeyEvent.KEYCODE_DPAD_DOWN -> {
                webView.evaluateJavascript("window.onRemoteKey('DOWN')", null)
                return true
            }
            KeyEvent.KEYCODE_BACK -> {
                // Let user exit if pressed twice or handle exit
                finish()
                return true
            }
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onDestroy() {
        super.onDestroy()
        udpServer?.stop()
    }
}
