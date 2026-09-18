package com.skypeck.controller

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Size
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.annotation.OptIn
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.pose.Pose
import com.google.mlkit.vision.pose.PoseDetection
import com.google.mlkit.vision.pose.PoseDetector
import com.google.mlkit.vision.pose.PoseLandmark
import com.google.mlkit.vision.pose.defaults.PoseDetectorOptions
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {

    private lateinit var previewView: PreviewView
    private lateinit var skeletonOverlay: SkeletonOverlayView
    private lateinit var dimOverlay: View
    private lateinit var tvStatusBadge: TextView
    private lateinit var tvFpsBadge: TextView
    private lateinit var btnRefreshTv: Button
    private lateinit var tvRollVal: TextView
    private lateinit var pbRoll: ProgressBar
    private lateinit var tvFlapVal: TextView
    private lateinit var pbFlap: ProgressBar
    private lateinit var tvDiveBadge: TextView
    private lateinit var btnCalibrate: Button
    private lateinit var btnFlipCamera: Button
    private lateinit var btnDimScreen: Button
    private lateinit var btnManualIp: Button

    private lateinit var cameraExecutor: ExecutorService
    private var cameraProvider: ProcessCameraProvider? = null
    private var lensFacing = CameraSelector.LENS_FACING_FRONT
    private var poseDetector: PoseDetector? = null

    private lateinit var kinematicsEngine: KinematicsEngine
    private lateinit var udpClient: UdpClient
    private val mainHandler = Handler(Looper.getMainLooper())

    private var frameCount = 0
    private var lastFpsTimestamp = System.currentTimeMillis()
    private var isScreenDimmed = false

    private val discoveryRunnable = object : Runnable {
        override fun run() {
            if (udpClient.targetTvAddress == null) {
                udpClient.discoverTv()
                mainHandler.postDelayed(this, 2000)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(R.layout.activity_main)

        initViews()
        initEngines()
        setupListeners()

        cameraExecutor = Executors.newSingleThreadExecutor()

        if (allPermissionsGranted()) {
            startCamera()
        } else {
            ActivityCompat.requestPermissions(
                this,
                REQUIRED_PERMISSIONS,
                REQUEST_CODE_PERMISSIONS
            )
        }

        // Start discovery loop
        mainHandler.post(discoveryRunnable)
    }

    private fun initViews() {
        previewView = findViewById(R.id.camera_preview)
        skeletonOverlay = findViewById(R.id.skeleton_overlay)
        dimOverlay = findViewById(R.id.dim_overlay)
        tvStatusBadge = findViewById(R.id.tv_status_badge)
        tvFpsBadge = findViewById(R.id.tv_fps_badge)
        btnRefreshTv = findViewById(R.id.btn_refresh_tv)
        tvRollVal = findViewById(R.id.tv_roll_val)
        pbRoll = findViewById(R.id.pb_roll)
        tvFlapVal = findViewById(R.id.tv_flap_val)
        pbFlap = findViewById(R.id.pb_flap)
        tvDiveBadge = findViewById(R.id.tv_dive_badge)
        btnCalibrate = findViewById(R.id.btn_calibrate)
        btnFlipCamera = findViewById(R.id.btn_flip_camera)
        btnDimScreen = findViewById(R.id.btn_dim_screen)
        btnManualIp = findViewById(R.id.btn_manual_ip)
    }

    private fun initEngines() {
        kinematicsEngine = KinematicsEngine(
            rollSensitivity = 1.25f,
            flapSensitivity = 1.6f,
            smoothing = 0.55f,
            invertRoll = false
        )

        udpClient = UdpClient(port = 9876) { ip, _ ->
            mainHandler.post {
                tvStatusBadge.text = "🟢 TV Bağlı: $ip"
                tvStatusBadge.setBackgroundResource(R.drawable.bg_badge_connected)
                tvStatusBadge.setTextColor(ContextCompat.getColor(this, R.color.accent_green))
                Toast.makeText(this, "Xiaomi TV Bağlantısı Kuruldu!", Toast.LENGTH_SHORT).show()
            }
        }

        // ML Kit Pose Detector with stream mode (60 FPS low-latency edge AI)
        val options = PoseDetectorOptions.Builder()
            .setDetectorMode(PoseDetectorOptions.STREAM_MODE)
            .build()
        poseDetector = PoseDetection.getClient(options)
    }

    private fun setupListeners() {
        btnCalibrate.setOnClickListener {
            kinematicsEngine.calibrateZero()
            Toast.makeText(this, "Duruş Sıfırlandı (Kalibre Edildi)", Toast.LENGTH_SHORT).show()
        }

        btnFlipCamera.setOnClickListener {
            lensFacing = if (lensFacing == CameraSelector.LENS_FACING_FRONT) {
                CameraSelector.LENS_FACING_BACK
            } else {
                CameraSelector.LENS_FACING_FRONT
            }
            startCamera()
        }

        btnDimScreen.setOnClickListener {
            toggleDimScreen()
        }

        dimOverlay.setOnClickListener {
            if (isScreenDimmed) {
                toggleDimScreen()
            }
        }

        btnRefreshTv.setOnClickListener {
            tvStatusBadge.text = "🔍 TV Aranıyor (Port 9876)..."
            tvStatusBadge.setBackgroundResource(R.drawable.bg_badge_searching)
            tvStatusBadge.setTextColor(ContextCompat.getColor(this, R.color.accent_gold))
            udpClient.discoverTv()
            Toast.makeText(this, "TV Arama Sinyali Gönderildi", Toast.LENGTH_SHORT).show()
        }

        btnManualIp.setOnClickListener {
            showManualIpDialog()
        }
    }

    private fun showManualIpDialog() {
        val input = EditText(this)
        input.hint = "Örn: 192.168.1.50"
        AlertDialog.Builder(this)
            .setTitle("Manuel TV IP Adresi")
            .setMessage("Mi Stick IP adresini girin (broadcast engelleniyorsa):")
            .setView(input)
            .setPositiveButton("Bağlan") { _, _ ->
                val ip = input.text.toString().trim()
                if (ip.isNotEmpty()) {
                    udpClient.setManualTvIp(ip)
                    tvStatusBadge.text = "🟢 TV IP Ayarlandı: $ip"
                    tvStatusBadge.setBackgroundResource(R.drawable.bg_badge_connected)
                    tvStatusBadge.setTextColor(ContextCompat.getColor(this, R.color.accent_green))
                }
            }
            .setNegativeButton("İptal", null)
            .show()
    }

    private fun toggleDimScreen() {
        isScreenDimmed = !isScreenDimmed
        val layoutParams = window.attributes
        if (isScreenDimmed) {
            dimOverlay.visibility = View.VISIBLE
            layoutParams.screenBrightness = 0.02f
            window.attributes = layoutParams
            Toast.makeText(this, "Ekran karartıldı. Açmak için ekrana dokunun.", Toast.LENGTH_SHORT).show()
        } else {
            dimOverlay.visibility = View.GONE
            layoutParams.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
            window.attributes = layoutParams
        }
    }

    private fun startCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
        cameraProviderFuture.addListener({
            cameraProvider = cameraProviderFuture.get()
            bindCameraUseCases()
        }, ContextCompat.getMainExecutor(this))
    }

    private fun bindCameraUseCases() {
        val provider = cameraProvider ?: return

        val preview = Preview.Builder().build()
        preview.setSurfaceProvider(previewView.surfaceProvider)

        val imageAnalysis = ImageAnalysis.Builder()
            .setTargetResolution(Size(480, 360)) // High performance & optimal 60 FPS
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build()

        imageAnalysis.setAnalyzer(cameraExecutor) { imageProxy ->
            processImageProxy(imageProxy)
        }

        val cameraSelector = CameraSelector.Builder()
            .requireLensFacing(lensFacing)
            .build()

        try {
            provider.unbindAll()
            provider.bindToLifecycle(this, cameraSelector, preview, imageAnalysis)
        } catch (e: Exception) {
            Toast.makeText(this, "Kamera başlatılamadı: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    @OptIn(ExperimentalGetImage::class)
    private fun processImageProxy(imageProxy: ImageProxy) {
        val mediaImage = imageProxy.image
        if (mediaImage == null) {
            imageProxy.close()
            return
        }

        val rotationDegrees = imageProxy.imageInfo.rotationDegrees
        val inputImage = InputImage.fromMediaImage(mediaImage, rotationDegrees)

        val detector = poseDetector ?: run {
            imageProxy.close()
            return
        }

        detector.process(inputImage)
            .addOnSuccessListener { pose ->
                handlePoseResult(pose, inputImage.width, inputImage.height)
            }
            .addOnFailureListener {
                // Skip frame on failure
            }
            .addOnCompleteListener {
                imageProxy.close()
            }
    }

    private fun handlePoseResult(pose: Pose, imgWidth: Int, imgHeight: Int) {
        val isFront = (lensFacing == CameraSelector.LENS_FACING_FRONT)
        if (pose.allPoseLandmarks.isEmpty()) {
            mainHandler.post {
                skeletonOverlay.updatePose(emptyList(), isFront, 0f, 0f, false)
            }
            return
        }

        val landmarks = extractJointPoints(pose, imgWidth.toFloat(), imgHeight.toFloat())
        val output = kinematicsEngine.processPose(landmarks)

        // Send telemetry directly via zero-latency UDP
        if (output.jsonString.isNotEmpty()) {
            udpClient.sendTelemetry(output.jsonString)
        }

        // Haptic feedback for wingspan flap
        if (output.isFlapping) {
            vibrateFlap()
        }

        // Update UI
        mainHandler.post {
            skeletonOverlay.updatePose(landmarks, isFront, output.roll, output.flap, output.isDiving)

            val rollDeg = output.roll * 45f
            tvRollVal.text = String.format("%.1f°", rollDeg)
            pbRoll.progress = ((output.roll + 1.0f) * 100f).toInt().coerceIn(0, 200)

            val flapPct = (output.flap * 100f).toInt()
            tvFlapVal.text = "$flapPct%"
            pbFlap.progress = flapPct.coerceIn(0, 100)

            tvDiveBadge.visibility = if (output.isDiving) View.VISIBLE else View.GONE

            // FPS Counter
            frameCount++
            val now = System.currentTimeMillis()
            if (now - lastFpsTimestamp >= 1000) {
                val fps = (frameCount * 1000f / (now - lastFpsTimestamp)).toInt()
                tvFpsBadge.text = "$fps FPS"
                frameCount = 0
                lastFpsTimestamp = now
            }
        }
    }

    private fun extractJointPoints(pose: Pose, imgW: Float, imgH: Float): List<JointPoint> {
        fun getPoint(type: Int): JointPoint {
            val lm = pose.getPoseLandmark(type)
            return if (lm != null && imgW > 0 && imgH > 0) {
                JointPoint(lm.position.x / imgW, lm.position.y / imgH)
            } else {
                JointPoint(0.5f, 0.5f)
            }
        }

        return listOf(
            getPoint(PoseLandmark.NOSE),            // 0
            getPoint(PoseLandmark.LEFT_SHOULDER),   // 1
            getPoint(PoseLandmark.RIGHT_SHOULDER),  // 2
            getPoint(PoseLandmark.LEFT_ELBOW),      // 3
            getPoint(PoseLandmark.RIGHT_ELBOW),     // 4
            getPoint(PoseLandmark.LEFT_WRIST),      // 5
            getPoint(PoseLandmark.RIGHT_WRIST),     // 6
            getPoint(PoseLandmark.LEFT_HIP),        // 7
            getPoint(PoseLandmark.RIGHT_HIP)        // 8
        )
    }

    @Suppress("DEPRECATION")
    private fun vibrateFlap() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vibratorManager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                vibratorManager?.defaultVibrator?.vibrate(
                    VibrationEffect.createOneShot(35, VibrationEffect.DEFAULT_AMPLITUDE)
                )
            } else {
                val v = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    v?.vibrate(VibrationEffect.createOneShot(35, VibrationEffect.DEFAULT_AMPLITUDE))
                } else {
                    v?.vibrate(35)
                }
            }
        } catch (_: Exception) {}
    }

    private fun allPermissionsGranted() = REQUIRED_PERMISSIONS.all {
        ContextCompat.checkSelfPermission(baseContext, it) == PackageManager.PERMISSION_GRANTED
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_CODE_PERMISSIONS) {
            if (allPermissionsGranted()) {
                startCamera()
            } else {
                Toast.makeText(this, "Kamera izni olmadan vücut takibi yapılamaz!", Toast.LENGTH_LONG).show()
                finish()
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        mainHandler.removeCallbacks(discoveryRunnable)
        cameraExecutor.shutdown()
        poseDetector?.close()
        udpClient.close()
    }

    companion object {
        private const val REQUEST_CODE_PERMISSIONS = 101
        private val REQUIRED_PERMISSIONS = arrayOf(Manifest.permission.CAMERA)
    }
}
