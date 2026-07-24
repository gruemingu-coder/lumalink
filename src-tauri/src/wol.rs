//! Wake-on-LAN: builds and broadcasts an IEEE 802.3 "magic packet" so a
//! sleeping/powered-off LumaLink Host PC can be woken up before the
//! user tries to connect. The host's network adapter must have WOL
//! enabled in its OS/BIOS settings for this to actually wake it — that
//! configuration is outside LumaLink's control.
//!
//! No extra crate needed: a magic packet is just 6 bytes of 0xFF
//! followed by the target MAC address repeated 16 times, sent as a
//! single UDP datagram to the LAN broadcast address.

use std::net::UdpSocket;

pub fn send_magic_packet(mac: &str) -> Result<(), String> {
    let mac_bytes = parse_mac(mac)?;

    let mut packet = Vec::with_capacity(6 + 16 * 6);
    packet.extend_from_slice(&[0xFF; 6]);
    for _ in 0..16 {
        packet.extend_from_slice(&mac_bytes);
    }

    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
    socket.set_broadcast(true).map_err(|e| e.to_string())?;

    // Port 9 ("discard") is the conventional WOL port; some NICs also
    // listen on 7. Sending to both maximizes compatibility.
    for port in [9u16, 7u16] {
        socket
            .send_to(&packet, ("255.255.255.255", port))
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Accepts common MAC formats: `AA:BB:CC:DD:EE:FF`, `AA-BB-CC-DD-EE-FF`,
/// or `AABBCCDDEEFF`.
fn parse_mac(mac: &str) -> Result<[u8; 6], String> {
    let cleaned: String = mac
        .chars()
        .filter(|c| c.is_ascii_hexdigit())
        .collect();
    if cleaned.len() != 12 {
        return Err(format!("올바르지 않은 MAC 주소입니다: {mac}"));
    }
    let mut bytes = [0u8; 6];
    for i in 0..6 {
        bytes[i] = u8::from_str_radix(&cleaned[i * 2..i * 2 + 2], 16)
            .map_err(|_| format!("올바르지 않은 MAC 주소입니다: {mac}"))?;
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_colon_separated_mac() {
        assert_eq!(
            parse_mac("AA:BB:CC:DD:EE:FF").unwrap(),
            [0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF]
        );
    }

    #[test]
    fn parses_dash_and_bare_mac() {
        assert_eq!(
            parse_mac("aa-bb-cc-dd-ee-ff").unwrap(),
            [0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF]
        );
        assert_eq!(
            parse_mac("AABBCCDDEEFF").unwrap(),
            [0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF]
        );
    }

    #[test]
    fn rejects_invalid_mac() {
        assert!(parse_mac("not-a-mac").is_err());
    }
}
