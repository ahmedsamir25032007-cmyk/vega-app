package com.vega

import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RuntimeShader
import android.graphics.Shader
import android.os.Build
import android.os.SystemClock
import android.view.Choreographer
import android.view.View
import android.view.ViewGroup
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import kotlin.math.max
import kotlin.math.min

/**
 * Vega's independent touch-following glass lens.
 *
 * A single backdrop snapshot is taken on press. AGSL then refracts that image
 * around the moving touch point. The snapshot is never re-captured per frame.
 */
class GlassRefractionView(context: ThemedReactContext) :
    View(context), Choreographer.FrameCallback {

    private var touchX = 0f
    private var touchY = 0f
    private var active = false
    private var startedAt = 0L
    private var releasedAt = 0L
    private var framePosted = false
    private var snapshot: Bitmap? = null
    private var backdropShader: BitmapShader? = null
    private var sourceScale = 0.5f
    private var originX = 0f
    private var originY = 0f
    private var progress = 0f
    private var opacity = 0f

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
                uniform float opacity;

                half4 main(float2 p) {
                    float2 delta = p - touch;
                    float distanceToTouch = max(length(delta), 0.001);
                    float normalizedDistance = distanceToTouch / radius;
                    float edgeMask = 1.0 - smoothstep(0.82, 1.0, normalizedDistance);
                    float dome = sqrt(max(0.0, 1.0 - normalizedDistance * normalizedDistance));
                    float2 direction = delta / distanceToTouch;

                    float waveFront = progress * radius * 1.25;
                    float waveDistance = distanceToTouch - waveFront;
                    float wave = sin(waveDistance * 0.105)
                        * exp(-abs(waveDistance) * 0.024)
                        * (1.0 - smoothstep(0.65, 1.0, progress));

                    float lensOffset = dome * strength + wave * 3.5;
                    float2 source = (p + origin + direction * lensOffset) * scale;
                    half4 refracted = backdrop.eval(source);

                    float rim = smoothstep(0.70, 0.91, normalizedDistance)
                        * (1.0 - smoothstep(0.91, 1.0, normalizedDistance));
                    float specular = rim * (0.16 + 0.12 * dome);

                    half3 color = min(refracted.rgb + half3(specular), half3(1.0));
                    return half4(color, edgeMask * opacity * 0.88);
                }
                """.trimIndent()
            )
        }.getOrNull() else null

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        isFilterBitmap = true
    }

    init {
        isClickable = false
        isFocusable = false
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
        setWillNotDraw(false)
    }

    fun setTouchX(value: Float) {
        touchX = value.coerceAtLeast(0f) * resources.displayMetrics.density
        if (active) invalidateAndSchedule()
    }

    fun setTouchY(value: Float) {
        touchY = value.coerceAtLeast(0f) * resources.displayMetrics.density
        if (active) invalidateAndSchedule()
    }

    fun setActive(value: Boolean) {
        if (value == active) return
        active = value
        if (value) {
            captureBackdrop()
            startedAt = 0L
            releasedAt = 0L
            progress = 0f
            opacity = 1f
            invalidateAndSchedule()
        } else if (snapshot != null) {
            releasedAt = SystemClock.uptimeMillis()
            invalidateAndSchedule()
        }
    }

    private fun invalidateAndSchedule() {
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
            // Preserve material layers below this view; exclude foreground content.
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
            hiddenSiblings.forEach { (sibling, oldState) ->
                sibling.visibility = oldState
            }
        }

        snapshot?.takeIf { !it.isRecycled }?.recycle()
        snapshot = fresh
        backdropShader = BitmapShader(
            fresh,
            Shader.TileMode.CLAMP,
            Shader.TileMode.CLAMP,
        )
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

        if (active) {
            if (startedAt == 0L) startedAt = frameTimeNanos
            progress = ((frameTimeNanos - startedAt) / 950_000_000f).coerceIn(0f, 1f)
            opacity = 1f
            postInvalidateOnAnimation()
            scheduleFrame()
        } else {
            val elapsedMs = (SystemClock.uptimeMillis() - releasedAt).coerceAtLeast(0L)
            opacity = (1f - elapsedMs / 260f).coerceIn(0f, 1f)
            if (opacity > 0f) {
                postInvalidateOnAnimation()
                scheduleFrame()
            } else {
                snapshot?.takeIf { !it.isRecycled }?.recycle()
                snapshot = null
                backdropShader = null
            }
        }
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val image = backdropShader ?: return
        val effect = shader ?: return
        if (Build.VERSION.SDK_INT < 33 || opacity <= 0f) return

        effect.setInputShader("backdrop", image)
        effect.setFloatUniform("origin", originX, originY)
        effect.setFloatUniform("touch", touchX, touchY)
        effect.setFloatUniform("scale", sourceScale)
        effect.setFloatUniform("progress", progress)
        effect.setFloatUniform("radius", 148f * resources.displayMetrics.density)
        effect.setFloatUniform("strength", 19f * resources.displayMetrics.density)
        effect.setFloatUniform("opacity", opacity)
        paint.shader = effect
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), paint)
    }

    override fun onDetachedFromWindow() {
        if (framePosted) Choreographer.getInstance().removeFrameCallback(this)
        framePosted = false
        snapshot?.takeIf { !it.isRecycled }?.recycle()
        snapshot = null
        backdropShader = null
        active = false
        super.onDetachedFromWindow()
    }
}

class GlassRefractionManager : SimpleViewManager<GlassRefractionView>() {
    override fun getName() = "VegaGlassRefraction"

    override fun createViewInstance(context: ThemedReactContext) =
        GlassRefractionView(context)

    @ReactProp(name = "touchX", defaultFloat = 0f)
    fun setTouchX(view: GlassRefractionView, value: Float) {
        view.setTouchX(value)
    }

    @ReactProp(name = "touchY", defaultFloat = 0f)
    fun setTouchY(view: GlassRefractionView, value: Float) {
        view.setTouchY(value)
    }

    @ReactProp(name = "active", defaultBoolean = false)
    fun setActive(view: GlassRefractionView, value: Boolean) {
        view.setActive(value)
    }
}
