// The wire between a host's browser and its guests. Every tab makes an X25519 key; each guest
// and the host derive a shared key and seal every message with XChaCha20-Poly1305. The relay
// in the middle routes opaque strings by room code and sees nothing else.

import { x25519 } from '@noble/curves/ed25519';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';

declare const __RELAY__: string;
export const RELAY = (import.meta.env.VITE_RELAY as string | undefined) ?? __RELAY__;

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export interface Keys {
  priv: Uint8Array;
  pub: string;
}

export function makeKeys(): Keys {
  const priv = x25519.utils.randomPrivateKey();
  return { priv, pub: bytesToHex(x25519.getPublicKey(priv)) };
}

/** One shared key per pair, bound to the table code. */
export const sharedKey = (mine: Keys, theirPub: string, table: string) => sha256(new Uint8Array([...x25519.getSharedSecret(mine.priv, hexToBytes(theirPub)), ...utf8ToBytes(`ghosttown/${table}`)]));

export function seal(key: Uint8Array, msg: unknown): string {
  const nonce = crypto.getRandomValues(new Uint8Array(24));
  const ct = xchacha20poly1305(key, nonce).encrypt(utf8ToBytes(JSON.stringify(msg)));
  return `${b64(nonce)}.${b64(ct)}`;
}

export function open<T>(key: Uint8Array, data: string): T | null {
  try {
    const [n, c] = data.split('.');
    return JSON.parse(new TextDecoder().decode(xchacha20poly1305(key, unb64(n)).decrypt(unb64(c))));
  } catch {
    return null; // tampered or not for us
  }
}

export const peerId = () => bytesToHex(crypto.getRandomValues(new Uint8Array(8)));

export interface Wire {
  send(data: string, to?: string): void;
  close(): void;
}

/** Connects to the relay. `onMsg` gets (from, data); `onPeer` (host only) gets joins and leaves. */
export function connect(table: string, role: 'host' | 'guest', id: string, onMsg: (from: string, data: string) => void, onPeer?: (id: string, joined: boolean) => void, onClose?: (reason: string) => void): Promise<Wire> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${RELAY}/?room=${table}&role=${role}&id=${id}`);
    let opened = false;
    ws.onopen = () => {
      opened = true;
      resolve({ send: (data, to) => ws.readyState === 1 && ws.send(JSON.stringify({ to: to ?? 'host', data })), close: () => ws.close() });
    };
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(String(e.data));
        if (m.type === 'msg') onMsg(m.from, m.data);
        else if (m.type === 'peer') onPeer?.(m.id, m.joined);
      } catch {
        /* ignore junk */
      }
    };
    ws.onclose = (e) => (opened ? onClose?.(e.reason || 'disconnected') : reject(new Error(e.reason || 'Could not reach the table.')));
    ws.onerror = () => !opened && reject(new Error('Could not reach the relay.'));
  });
}
