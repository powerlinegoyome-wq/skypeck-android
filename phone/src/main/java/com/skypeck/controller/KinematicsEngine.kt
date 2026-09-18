package com.skypeck.controller

import java.util.Locale
import kotlin.math.atan2
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

data class JointPoint(val x: Float, val y: Float)

data class FlightOutput(
    val roll: Float,
    val flap: Float,
    val isDiving: Boolean,
    val isFlapping: Boolean,
    val jsonString: String
)

class KinematicsEngine(
    var rollSensitivity: Float = 1.4f,
    var flapSensitivity: Float = 1.5f,
    var smoothing: Float = 0.5f,
    var invertRoll: Boolean = false
) {
    private var restingAngle: Float = 0f
    private var smoothedRoll: Float = 0f
    private var flapPower: Float = 0f
    private var lastWristY: Float? = null
    private var lastTimeMs: Long = System.currentTimeMillis()
    private var lastFlapTriggerMs: Long = 0L

    fun processPose(landmarks: List<JointPoint>): FlightOutput {
        if (landmarks.size < 9) {
            return FlightOutput(0f, 0f, isDiving = false, isFlapping = false, jsonString = "")
        }

        val now = System.currentTimeMillis()
        val dt = max(0.001f, (now - lastTimeMs) / 1000f)
        lastTimeMs = now

        val nose = landmarks[0]
        val lShoulder = landmarks[1]
        val rShoulder = landmarks[2]
        val lWrist = landmarks[5]
        val rWrist = landmarks[6]

        // 1. Relative Wingspan Scaling
        val shoulderDist = hypot(rShoulder.x - lShoulder.x, rShoulder.y - lShoulder.y)
        val wristDist = hypot(rWrist.x - lWrist.x, rWrist.y - lWrist.y)
        val wingspanRatio = wristDist / max(0.01f, shoulderDist)

        // 2. Roll / Bank Angle (atan2 from screen-left to screen-right)
        val screenLeftWrist = if (rWrist.x < lWrist.x) rWrist else lWrist
        val screenRightWrist = if (rWrist.x > lWrist.x) rWrist else lWrist

        val dx = screenRightWrist.x - screenLeftWrist.x
        val dy = screenRightWrist.y - screenLeftWrist.y
        var rawAngle = atan2(dy, max(0.01f, dx))
        if (invertRoll) rawAngle = -rawAngle

        // Adaptive resting lean filter
        restingAngle += (rawAngle - restingAngle) * 0.002f
        val targetRoll = (rawAngle - restingAngle) * rollSensitivity
        smoothedRoll = smoothedRoll * smoothing + targetRoll * (1f - smoothing)
        val clampedRoll = max(-1.0f, min(1.0f, smoothedRoll))

        // 3. Flap Velocity Detection
        val avgWristY = (lWrist.y + rWrist.y) / 2f
        val avgShoulderY = (lShoulder.y + rShoulder.y) / 2f

        var isFlappingNow = false
        val prevY = lastWristY
        if (prevY != null) {
            val wristVelocityY = (avgWristY - prevY) / dt
            if (wristVelocityY > 0.7f * flapSensitivity && now - lastFlapTriggerMs > 220) {
                val strength = min(1.0f, (wristVelocityY / 2.5f) * flapSensitivity)
                flapPower = max(flapPower, strength)
                lastFlapTriggerMs = now
                isFlappingNow = true
            }
        }
        lastWristY = avgWristY
        flapPower = max(0f, flapPower - dt * 2.8f)

        // 4. Dive Detection
        val isDiving = wingspanRatio < 1.05f && avgWristY > avgShoulderY

        // 5. Build Compact JSON Payload with strict US Locale (dots not commas!)
        val skelPointsJson = landmarks.joinToString(separator = ",", prefix = "[", postfix = "]") {
            "[${String.format(Locale.US, "%.3f", it.x)},${String.format(Locale.US, "%.3f", it.y)}]"
        }

        val json = """{"t":$now,"roll":${String.format(Locale.US, "%.3f", clampedRoll)},"flap":${String.format(Locale.US, "%.2f", flapPower)},"dive":$isDiving,"skel":$skelPointsJson}"""

        return FlightOutput(clampedRoll, flapPower, isDiving, isFlappingNow, json)
    }

    fun calibrateZero() {
        restingAngle = 0f
        smoothedRoll = 0f
    }
}
