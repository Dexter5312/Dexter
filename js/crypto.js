/**
 * E2EE Cryptography Module using Web Crypto API
 * 
 * RSA-OAEP for Key Exchange
 * AES-GCM for Message Encryption
 */

const CryptoUtil = {
    // Utility to convert ArrayBuffer to Base64 string
    bufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    },

    // Utility to convert Base64 string to ArrayBuffer
    base64ToBuffer(base64) {
        const binary_string = window.atob(base64);
        const len = binary_string.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary_string.charCodeAt(i);
        }
        return bytes.buffer;
    },

    // Utility to convert String to ArrayBuffer
    strToBuffer(str) {
        return new TextEncoder().encode(str);
    },

    // Utility to convert ArrayBuffer to String
    bufferToStr(buffer) {
        return new TextDecoder().decode(buffer);
    },

    // Generate RSA Key Pair for a new user
    async generateRSAKeyPair() {
        return await window.crypto.subtle.generateKey(
            {
                name: "RSA-OAEP",
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: "SHA-256",
            },
            true, // extractable
            ["encrypt", "decrypt"]
        );
    },

    // Export Public Key to JWK string (to send to server)
    async exportPublicKey(key) {
        const jwk = await window.crypto.subtle.exportKey("jwk", key);
        return JSON.stringify(jwk);
    },

    // Export Private Key to JWK string (to save in localStorage)
    async exportPrivateKey(key) {
        const jwk = await window.crypto.subtle.exportKey("jwk", key);
        return JSON.stringify(jwk);
    },

    // Import Public Key from JWK string
    async importPublicKey(jwkString) {
        const jwk = JSON.parse(jwkString);
        return await window.crypto.subtle.importKey(
            "jwk",
            jwk,
            { name: "RSA-OAEP", hash: "SHA-256" },
            true,
            ["encrypt"]
        );
    },

    // Import Private Key from JWK string
    async importPrivateKey(jwkString) {
        const jwk = JSON.parse(jwkString);
        return await window.crypto.subtle.importKey(
            "jwk",
            jwk,
            { name: "RSA-OAEP", hash: "SHA-256" },
            true,
            ["decrypt"]
        );
    },

    // Generate a one-time AES-GCM symmetric key
    async generateAESKey() {
        return await window.crypto.subtle.generateKey(
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );
    },

    // Export AES Key to raw buffer to be encrypted by RSA
    async exportAESKey(key) {
        return await window.crypto.subtle.exportKey("raw", key);
    },

    // Import AES Key from raw buffer
    async importAESKey(rawBuffer) {
        return await window.crypto.subtle.importKey(
            "raw",
            rawBuffer,
            { name: "AES-GCM" },
            true,
            ["encrypt", "decrypt"]
        );
    },

    // Encrypt message with AES-GCM
    // Format: JSON {iv, ct} — safe for all Unicode including emoji
    async encryptMessage(messageStr, aesKey) {
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        // TextEncoder always uses UTF-8, correctly handles emoji (4-byte sequences)
        const encoded = new TextEncoder().encode(messageStr);
        
        const ciphertextBuffer = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            aesKey,
            encoded
        );
        
        // Store as JSON — avoids any separator collision issues
        return JSON.stringify({
            iv: this.bufferToBase64(iv),
            ct: this.bufferToBase64(ciphertextBuffer)
        });
    },

    // Decrypt message with AES-GCM
    // Supports new JSON format AND old "iv:ciphertext" format (backward compat)
    async decryptMessage(encryptedPayload, aesKey) {
        let ivB64, ctB64;

        if (encryptedPayload.startsWith('{')) {
            // New JSON format: {"iv":"...","ct":"..."}
            try {
                const parsed = JSON.parse(encryptedPayload);
                ivB64 = parsed.iv;
                ctB64 = parsed.ct;
            } catch {
                throw new Error('Invalid JSON encrypted payload');
            }
        } else {
            // Legacy format: "ivBase64:ciphertextBase64"
            // Use indexOf to split ONLY on first colon (safe even if ct has colons)
            const colonIdx = encryptedPayload.indexOf(':');
            if (colonIdx === -1) throw new Error('Invalid encrypted payload: no separator found');
            ivB64 = encryptedPayload.slice(0, colonIdx);
            ctB64 = encryptedPayload.slice(colonIdx + 1);
        }

        const iv = this.base64ToBuffer(ivB64);
        const ciphertext = this.base64ToBuffer(ctB64);
        
        const decryptedBuffer = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: new Uint8Array(iv) },
            aesKey,
            ciphertext
        );
        
        // TextDecoder always uses UTF-8, correctly restores emoji
        return new TextDecoder().decode(decryptedBuffer);
    },

    // Encrypt AES key buffer with RSA Public Key
    async encryptAESKeyWithRSA(aesKeyRawBuffer, rsaPublicKey) {
        const encryptedBuffer = await window.crypto.subtle.encrypt(
            { name: "RSA-OAEP" },
            rsaPublicKey,
            aesKeyRawBuffer
        );
        return this.bufferToBase64(encryptedBuffer);
    },

    // Decrypt AES key buffer with RSA Private Key
    async decryptAESKeyWithRSA(encryptedAESKeyBase64, rsaPrivateKey) {
        const encryptedBuffer = this.base64ToBuffer(encryptedAESKeyBase64);
        const decryptedBuffer = await window.crypto.subtle.decrypt(
            { name: "RSA-OAEP" },
            rsaPrivateKey,
            encryptedBuffer
        );
        return decryptedBuffer; // Raw AES key buffer
    }
};
