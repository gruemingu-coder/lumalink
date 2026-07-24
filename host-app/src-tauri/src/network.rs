//! Small network-info helpers exposed to the signaling layer (host's
//! MAC address, reported during pairing so the client can later send a
//! Wake-on-LAN magic packet) and to the UI (for display/debugging and
//! cloud device-sync heartbeats).

use std::net::UdpSocket;

/// Best-effort MAC address of the machine's primary network interface,
/// formatted as `AA:BB:CC:DD:EE:FF`. Returns `None` if it can't be
/// determined (e.g. no active network interface).
pub fn primary_mac_address() -> Option<String> {
    let mac = mac_address::get_mac_address().ok().flatten()?;
    Some(mac.to_string().to_uppercase())
}

/// Best-effort LAN IPv4 address of the machine's primary network
/// interface. Uses the "connect a UDP socket, read back its local
/// address" trick — `connect()` on a UDP socket just resolves a route
/// locally, it never actually sends a packet, so this generates no
/// network traffic and works without internet access as long as a
/// default route exists.
pub fn local_ipv4() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    Some(socket.local_addr().ok()?.ip().to_string())
}
