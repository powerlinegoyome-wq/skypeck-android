package fun.skypeck.tv

import android.util.Log
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import kotlin.concurrent.thread

class UdpServer(
    private val port: Int = 9876,
    private val onTelemetryReceived: (String) -> Unit
) {
    private var isRunning = false
    private var socket: DatagramSocket? = null

    fun start() {
        if (isRunning) return
        isRunning = true

        thread(name = "SkyPeckUdpServer", isDaemon = true) {
            try {
                socket = DatagramSocket(port)
                socket?.broadcast = true
                Log.i("SkyPeckTV", "UDP Server listening on port $port")

                val buffer = ByteArray(2048)
                while (isRunning) {
                    val packet = DatagramPacket(buffer, buffer.size)
                    socket?.receive(packet)

                    val text = String(packet.data, 0, packet.length).trim()

                    // Auto-Discovery: If phone asks "DISCOVER_SKYPECK"
                    if (text.contains("DISCOVER")) {
                        val response = """{"cmd":"TV_READY","name":"Xiaomi Mi TV Stick"}""".toByteArray()
                        val replyPacket = DatagramPacket(response, response.size, packet.address, packet.port)
                        socket?.send(replyPacket)
                        Log.i("SkyPeckTV", "Replied TV_READY to discovery from ${packet.address}")
                    } else {
                        // Real-time Flight Telemetry JSON
                        onTelemetryReceived(text)
                    }
                }
            } catch (e: Exception) {
                if (isRunning) {
                    Log.e("SkyPeckTV", "UDP Server Error: ${e.message}")
                }
            }
        }
    }

    fun stop() {
        isRunning = false
        try {
            socket?.close()
        } catch (_: Exception) {}
        socket = null
    }
}
