package com.vega

import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.RuntimeShader
import android.graphics.Shader
import android.os.Build
import android.view.Choreographer
import android.view.View
import android.view.ViewGroup
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * Touch-driven backdrop lens for LiquidGlassSurface.
 *
 * Captures the current glass backdrop once per touch (never continuously), then
 * uses an AGSL shader to bend pixels around the touch point for a short wave.
 * Android 13+ only. The JS material remains the fallback on older Android,
 * iOS and TV builds.
 */
class GlassRefractionView(context: ThemedReactContext) :
    View(context), Choreographer.FrameCallback {

    private var touchX = 0f
    private var touchY = 0f
    private var lastPulse = 0
    private var startedAt = 0L
    private var framePosted = false
    private var snapshot: Bitmap? = null
    private var backdropShader: BitmapShader? = null
    private var sourceScale = 0.5f
    private var originX = 0f
    private var originY = 0f
    private var progress = 0f

    private val shader: RuntimeShader? =
        if (Build.VERSION.SDK_INT >= 33) runCatching {
            RuntimeShader(
                """
                uniform shader backdrop;
                uniform float2 origin;
                uniform float2 touch;
                uniform float scale;
                uniform float progress;
                uniform float radius;
                uniform float strength;

                half4 main(float2 p) {
                    float2 delta = p - touch;
                    float distanceToTouch = max(length(delta), 0.001);
                    float envelope = 1.0 - smoothstep(radius * 0.52, radius, distanceToTouch);
                    float waveFront = progress * radius * 0.92;
                    float wave = sin((distanceToTouch - waveFront) * 0.105)
                        * exp(-abs(distanceToTouch - waveFront) * 0.020);
                    float2 direction = delta / distanceToTouch;
                    float2 source = (p + origin) * scale
                        + direction * wave * strength * envelope * scale;
                    val sample = backdrop.eval(source)
                    return half4(sample.rgb, envelope * 0.82);
                }
                """.trimIndent()
            )
        }.getOrNull() else null

    init {
        isClickable = false
        isFocusable = false
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
        setWillNotDraw(false)
    }

    fun setTouchX(x: Float) { touchX = x.coerceAtLeast(0f) * resources.displayMetrics.density }
    fun setTouchY(y: Float) { touchY = y.coerceAtLeast(0f) * resources.displayMetrics.density }

    fun setPulse(value: Int) {
        if (value == lastPulse) return
        lastPulse = value
        if (Build.VERSION.SDK_INT < 33 || shader == null || !isAttachedToWindow) return
        captureBackdrop()
        startedAt = 0L
        progress = 0f
        postInvalidateOnAnimation()
        scheduleFrame()
    }

    private fun captureBackdrop() {
        val root = rootView ?: return
        if (root.width <= 0 || root.height <= 0 || width <= 0 || height <= 0) return

        val maxSide = max(root.width, root.height).toFloat()
        sourceScale = min(0.5f, 1440f / maxSide).coerceAtLeast(0.2f)
        val bitmapWidth = max(1, (root.width * sourceScale).toInt())
        val bitmapHeight = max(1, (root.height * sourceScale).toInt())
        val fresh = runCatching {
            Bitmap.createBitmap(bitmapWidth, bitmapHeight, Bitmap.Config.ARGB_8888)
        }.getOrNull() ?: return

        val oldVisibility = visibility
        val parentGroup = parent as? ViewGroup
        val ownIndex = parentGroup?.indexOfChild(this) ?: -1
        val hiddenSiblings = mutableListOf<Pair<View, Int>>()
        val rootLocation = IntArray(2)
        val viewLocation = IntArray(2)
        root.getLocationOnScreen(rootLocation)
        getLocationOnScreen(viewLocation)
        originX = (viewLocation[0] - rootLocation[0]).toFloat()
        originY = (viewLocation[1] - rootLocation[1]).toFloat()

        try {
            // Keep the backdrop layers, but omit this lens and later foreground siblings.
            visibility = INVISIBLE
            if (parentGroup != null && ownIndex >= 0) {
                for (index in ownIndex + 1 until parentGroup.childCount) {
                    val sibling = parentGroup.getChildAt(index)
                    hiddenSiblings += sibling to sibling.visibility
                    sibling.visibility = INVISIBLE
                }
            }
            val canvas = Canvas(fresh)
            canvas.scale(sourceScale, sourceScale)
            root.draw(canvas)
        } catch (_: Exception) {
            fresh.recycle()
            return
        } finally {
            visibility = oldVisibility
            hiddenSiblings.forEach { (sibling, oldState) -> sibling.visibility = oldState }
        }

        snapshot?.takeIf { !it.isRecycled }?.recycle()
        snapshot = fresh
        backdropShader = BitmapShader(fresh, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
    }

    private fun scheduleFrame() {
        if (!framePosted && isAttachedToWindow) {
            framePosted = true
            Choreographer.getInstance().postFrameCallback(this)
        }
    }

    override fun doFrame(frameTimeNanos: Long) {
        framePosted = false
        if (!isAttachedToWindow || snapshot == null || shader == null) return
        if (startedAt == 0L) startedAt = frameTimeNanos
        progress = ((frameTimeNanos - startedAt) / 720_000_000f).coerceIn(0f, 1f)
        postInvalidateOnAnimation()
        if (progress < 1f) scheduleFrame()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val image = backdropShader ?: return
        val effect = shader ?: return
        if (Build.VERSION.SDK_INT < 33 || progress >= 1f) return

        effect.setInputShader("backdrop", image)
        effect.setFloatUniform("origin", originX, originY)
        effect.setFloatUniform("touch", touchX, touchY)
        effect.setFloatUniform("scale", sourceScale)
        effect.setFloatUniform("progress", progress)
        effect.setFloatUniform("radius", 150f * resources.displayMetrics.density)
        effect.setFloatUniform("strength", 22f)
        val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
            shader = effect
        }
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), paint)
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
    }

    override fun onDetachedFromWindow() {
        if (framePosted) Choreographer.getInstance().removeFrameCallback(this)
        framePosted = false
        snapshot?.takeIf { !it.isRecycled }?.recycle()
        snapshot = null
        backdropShader = null
        super.onDetachedFromWindow()
    }
}

class GlassRefractionManager : SimpleViewManager<GlassRefractionView>() {
    override fun getName() = "VegaGlassRefraction"
    override fun createViewInstance(context: ThemedReactContext) = GlassRefractionView(context)

    @ReactProp(name = "touchX", defaultFloat = 0f)
    fun setTouchX(view: GlassRefractionView, value: Float) {
        view.setTouchX(value)
    }

    @ReactProp(name = "touchY", defaultFloat = 0f)
    fun setTouchY(view: GlassRefractionView, value: Float) {
        view.setTouchY(value)
    }

    @ReactProp(name = "pulse", defaultInt = 0)
    fun setPulse(view: GlassRefractionView, value: Int) {
        view.setPulse(value)
    }
}
