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
    // Returns { ciphertextBase64, ivBase64 } combined as "iv:ciphertext"
    async encryptMessage(messageStr, aesKey) {
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encoded = this.strToBuffer(messageStr);
        
        const ciphertextBuffer = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            aesKey,
            encoded
        );
        
        const ivB64 = this.bufferToBase64(iv);
        const cipherB64 = this.bufferToBase64(ciphertextBuffer);
        return `${ivB64}:${cipherB64}`;
    },

    // Decrypt message with AES-GCM
    async decryptMessage(encryptedPayload, aesKey) {
        const parts = encryptedPayload.split(':');
        if (parts.length !== 2) throw new Error("Invalid encrypted payload format");
        
        const iv = this.base64ToBuffer(parts[0]);
        const ciphertext = this.base64ToBuffer(parts[1]);
        
        const decryptedBuffer = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: new Uint8Array(iv) },
            aesKey,
            ciphertext
        );
        
        return this.bufferToStr(decryptedBuffer);
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
