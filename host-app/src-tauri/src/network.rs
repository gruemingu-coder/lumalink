//! Small network-info helpers exposed to the signaling layer (host's
//! MAC address, reported during pairing so the client can later send a
//! Wake-on-LAN magic packet) and to the UI (for display/debugging).

/// Best-effort MAC address of the machine's primary network interface,
/// formatted as `AA:BB:CC:DD:EE:FF`. Returns `None` if it can't be
/// determined (e.g. no active network interface).
pub fn primary_mac_address() -> Option<String> {
    let mac = mac_address::get_mac_address().ok().flatten()?;
    Some(mac.to_string().to_uppercase())
}
