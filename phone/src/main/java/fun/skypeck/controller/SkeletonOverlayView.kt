package fun.skypeck.controller

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.util.AttributeSet
import android.view.View

class SkeletonOverlayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private var landmarks: List<JointPoint> = emptyList()
    private var isMirrored: Boolean = true
    private var currentRoll: Float = 0f
    private var currentFlap: Float = 0f
    private var isDiving: Boolean = false

    // Paints
    private val bonePaint = Paint().apply {
        color = Color.parseColor("#00E5FF")
        strokeWidth = 8f
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        isAntiAlias = true
    }

    private val jointPaint = Paint().apply {
        color = Color.parseColor("#FFD600")
        style = Paint.Style.FILL
        isAntiAlias = true
    }

    private val wristPaint = Paint().apply {
        color = Color.parseColor("#00E676")
        style = Paint.Style.FILL
        isAntiAlias = true
    }

    private val horizonPaint = Paint().apply {
        color = Color.argb(120, 0, 229, 255)
        strokeWidth = 3f
        style = Paint.Style.STROKE
        isAntiAlias = true
    }

    private val divePaint = Paint().apply {
        color = Color.argb(160, 255, 61, 0)
        style = Paint.Style.FILL
        isAntiAlias = true
    }

    fun updatePose(
        points: List<JointPoint>,
        mirrored: Boolean,
        roll: Float,
        flap: Float,
        diving: Boolean
    ) {
        this.landmarks = points
        this.isMirrored = mirrored
        this.currentRoll = roll
        this.currentFlap = flap
        this.isDiving = diving
        postInvalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0 || h <= 0) return

        // 1. Draw Horizon Roll Guide in Center
        val centerX = w / 2f
        val centerY = h / 2f
        canvas.save()
        canvas.rotate(-currentRoll * 35f, centerX, centerY)
        canvas.drawLine(centerX - 100f, centerY, centerX + 100f, centerY, horizonPaint)
        canvas.drawCircle(centerX, centerY, 6f, horizonPaint)
        canvas.restore()

        // 2. Draw Dive / Flap Flash
        if (isDiving) {
            canvas.drawRect(0f, 0f, w, 24f, divePaint)
        }

        if (landmarks.size < 9) return

        fun mapX(normX: Float): Float = if (isMirrored) (1f - normX) * w else normX * w
        fun mapY(normY: Float): Float = normY * h

        val nose = landmarks[0]
        val lShoulder = landmarks[1]
        val rShoulder = landmarks[2]
        val lElbow = landmarks[3]
        val rElbow = landmarks[4]
        val lWrist = landmarks[5]
        val rWrist = landmarks[6]
        val lHip = landmarks[7]
        val rHip = landmarks[8]

        // Dynamic flap glow stroke
        bonePaint.strokeWidth = 8f + (currentFlap * 12f)
        if (currentFlap > 0.3f) {
            bonePaint.color = Color.parseColor("#FFFFFF")
        } else {
            bonePaint.color = Color.parseColor("#00E5FF")
        }

        fun drawBone(p1: JointPoint, p2: JointPoint) {
            canvas.drawLine(mapX(p1.x), mapY(p1.y), mapX(p2.x), mapY(p2.y), bonePaint)
        }

        // Bones
        drawBone(lWrist, lElbow)
        drawBone(lElbow, lShoulder)
        drawBone(lShoulder, rShoulder)
        drawBone(rShoulder, rElbow)
        drawBone(rElbow, rWrist)

        drawBone(lShoulder, lHip)
        drawBone(rShoulder, rHip)
        drawBone(lHip, rHip)

        // Joint nodes
        landmarks.forEachIndexed { index, p ->
            val px = mapX(p.x)
            val py = mapY(p.y)
            when (index) {
                5, 6 -> canvas.drawCircle(px, py, 18f, wristPaint) // Wrists (controllers)
                0 -> {
                    // Head marker
                    canvas.drawCircle(px, py, 14f, jointPaint)
                    canvas.drawCircle(px, py, 22f, horizonPaint)
                }
                else -> canvas.drawCircle(px, py, 10f, jointPaint)
            }
        }
    }
}
