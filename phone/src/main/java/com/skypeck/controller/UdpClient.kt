package com.skypeck.controller

import android.util.Log
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.util.concurrent.Executors
import kotlin.concurrent.thread

class UdpClient(
    private val port: Int = 9876,
    private val onTvDiscovered: (String, String) -> Unit
) {
    private var socket: DatagramSocket? = null
    var targetTvAddress: InetAddress? = null
    private var broadcastAddress: InetAddress? = null
    private var isListening = false
    private val sendExecutor = Executors.newSingleThreadExecutor()

    init {
        try {
            socket = DatagramSocket()
            socket?.broadcast = true
            broadcastAddress = InetAddress.getByName("255.255.255.255")
            startResponseListener()
        } catch (e: Exception) {
            Log.e("SkyPeckController", "Failed to init UDP socket: ${e.message}")
        }
    }

    private fun getBroadcastTargets(): List<InetAddress> {
        val targets = mutableListOf<InetAddress>()
        try {
            targets.add(InetAddress.getByName("255.255.255.255"))
            val interfaces = java.net.NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val netIf = interfaces.nextElement()
                if (netIf.isLoopback || !netIf.isUp) continue
                for (ifaceAddr in netIf.interfaceAddresses) {
                    val bcast = ifaceAddr.broadcast
                    if (bcast != null) {
                        targets.add(bcast)
                    }
                }
            }
        } catch (_: Exception) {}
        return targets.distinct()
    }

    private fun getSubnetPrefixes(): List<String> {
        val prefixes = mutableListOf<String>()
        try {
            val interfaces = java.net.NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val netIf = interfaces.nextElement()
                if (netIf.isLoopback || !netIf.isUp) continue
                for (ifaceAddr in netIf.interfaceAddresses) {
                    val addr = ifaceAddr.address
                    if (addr is java.net.Inet4Address && !addr.isLoopbackAddress) {
                        val ip = addr.hostAddress ?: continue
                        val parts = ip.split(".")
                        if (parts.size == 4) {
                            prefixes.add("${parts[0]}.${parts[1]}.${parts[2]}.")
                        }
                    }
                }
            }
        } catch (_: Exception) {}
        if (prefixes.isEmpty()) {
            prefixes.add("192.168.1.")
        }
        return prefixes.distinct()
    }

    /**
     * Broadcasts discovery packet across local Wi-Fi to find Xiaomi Mi TV Stick automatically.
     * Also performs direct /24 subnet unicast ping to bypass all router broadcast/AP isolation.
     */
    fun discoverTv() {
        sendExecutor.execute {
            try {
                val message = """{"cmd":"DISCOVER_SKYPECK"}""".toByteArray(Charsets.UTF_8)

                // 1. Broadcast targets (255.255.255.255 & interface broadcasts)
                val targets = getBroadcastTargets()
                for (target in targets) {
                    try {
                        val packet = DatagramPacket(message, message.size, target, port)
                        socket?.send(packet)
                    } catch (_: Exception) {}
                }

                // 2. Direct Subnet Unicast Scan (/24) - Bypasses all router broadcast blocks!
                val prefixes = getSubnetPrefixes()
                for (prefix in prefixes) {
                    for (host in 1..254) {
                        try {
                            val addr = InetAddress.getByName("$prefix$host")
                            val packet = DatagramPacket(message, message.size, addr, port)
                            socket?.send(packet)
                        } catch (_: Exception) {}
                    }
                }
                Log.d("SkyPeckController", "Sent discovery broadcast and subnet unicast scan on port $port")
            } catch (e: Exception) {
                Log.w("SkyPeckController", "Discovery broadcast error: ${e.message}")
            }
        }
    }

    /**
     * Allows setting a manual TV IP address if broadcast is blocked by network AP isolation.
     */
    fun setManualTvIp(ipStr: String) {
        sendExecutor.execute {
            try {
                val addr = InetAddress.getByName(ipStr.trim())
                targetTvAddress = addr
                Log.i("SkyPeckController", "Manual TV IP set to: $addr")
            } catch (e: Exception) {
                Log.e("SkyPeckController", "Invalid manual TV IP: $ipStr")
            }
        }
    }

    /**
     * Listens for TV_READY responses from Android TV.
     */
    private fun startResponseListener() {
        isListening = true
        thread(name = "UdpResponseListener", isDaemon = true) {
            val buffer = ByteArray(2048)
            while (isListening) {
                try {
                    val packet = DatagramPacket(buffer, buffer.size)
                    socket?.receive(packet)
                    val text = String(packet.data, 0, packet.length).trim()

                    if (text.contains("TV_READY")) {
                        targetTvAddress = packet.address
                        val ip = packet.address.hostAddress ?: ""
                        Log.i("SkyPeckController", "Discovered TV at: $ip -> $text")
                        onTvDiscovered(ip, text)
                    }
                } catch (e: Exception) {
                    if (!isListening) break
                }
            }
        }
    }

    /**
     * Sends zero-latency telemetry packet directly to TV Stick IP (or broadcast fallback).
     */
    fun sendTelemetry(jsonPayload: String) {
        val target = targetTvAddress ?: broadcastAddress ?: return
        sendExecutor.execute {
            try {
                val bytes = jsonPayload.toByteArray(Charsets.UTF_8)
                val packet = DatagramPacket(bytes, bytes.size, target, port)
                socket?.send(packet)
            } catch (_: Exception) {}
        }
    }

    fun close() {
        isListening = false
        sendExecutor.shutdown()
        socket?.close()
        socket = null
    }
}
