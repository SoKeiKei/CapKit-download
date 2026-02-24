const { kv } = require('@vercel/kv');
const nacl = require('tweetnacl');
const naclUtil = require('tweetnacl-util');

// 辅助函数：将 Base64 字符串转换为 Uint8Array
function decodeBase64(s) {
    return naclUtil.decodeBase64(s);
}

// 辅助函数：将 Uint8Array 转换为 Base64 字符串
function encodeBase64(arr) {
    return naclUtil.encodeBase64(arr);
}

// 辅助函数：将字符串转换为 Uint8Array
function stringToUint8Array(str) {
    return naclUtil.decodeUTF8(str);
}

// 辅助函数：从环境变量加载私钥
function getPrivateKey() {
    const keyStr = process.env.PRIVATE_KEY;
    if (!keyStr) {
        throw new Error('Server configuration error: PRIVATE_KEY not set');
    }
    
    // 支持两种格式：
    // 1. Base64 字符串 (推荐)
    // 2. 逗号分隔的数字数组 (兼容旧版)
    try {
        if (keyStr.includes(',')) {
            const arr = keyStr.split(',').map(Number);
            return new Uint8Array(arr);
        } else {
            return decodeBase64(keyStr);
        }
    } catch (e) {
        throw new Error('Invalid PRIVATE_KEY format');
    }
}

export default async function handler(request, response) {
    // 1. 只允许 POST 请求
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { redeem_code, machine_id } = request.body;

        // 2. 参数校验
        if (!redeem_code || !machine_id) {
            return response.status(400).json({ error: 'Missing redeem_code or machine_id' });
        }

        const cleanCode = redeem_code.trim();
        const cleanMachineId = machine_id.trim();

        // 3. 查询兑换码状态 (从 Vercel KV)
        // key 格式: "redeem:XXXX-XXXX-XXXX-XXXX"
        const dbKey = `redeem:${cleanCode}`;
        const record = await kv.get(dbKey);

        if (!record) {
            return response.status(404).json({ error: '无效的兑换码' });
        }

        // 4. 检查绑定状态
        if (record.status === 'used') {
            // 如果已被使用，检查是否是同一台机器 (允许重装找回)
            if (record.machine_id !== cleanMachineId) {
                return response.status(403).json({ 
                    error: '此兑换码已被其他设备绑定，无法在新设备上使用。' 
                });
            }
            // 如果是同一台机器，允许重新获取激活码
        } else {
            // 首次激活：绑定机器码
            await kv.set(dbKey, {
                status: 'used',
                machine_id: cleanMachineId,
                activated_at: new Date().toISOString()
            });
        }

        // 5. 生成激活码 (核心加密逻辑)
        // 对应 Rust: ed25519_dalek::SigningKey::from_bytes(&PRIVATE_KEY_BYTES)
        const seed = getPrivateKey();
        if (seed.length !== 32) {
            throw new Error(`Invalid private key length: ${seed.length} (expected 32)`);
        }

        // 生成密钥对 (Rust 的 SigningKey 对应 tweetnacl 的 seed)
        const keyPair = nacl.sign.keyPair.fromSeed(seed);

        // 签名内容: machine_id 的字节
        const messageBytes = stringToUint8Array(cleanMachineId);
        
        // 生成签名 (64 bytes)
        const signature = nacl.sign.detached(messageBytes, keyPair.secretKey);

        // 拼接 Payload: Signature (64 bytes) + MachineID (Raw Bytes)
        const payload = new Uint8Array(signature.length + messageBytes.length);
        payload.set(signature);
        payload.set(messageBytes, signature.length);

        // Base64 编码
        const licenseKey = encodeBase64(payload);

        // 6. 返回成功
        return response.status(200).json({ 
            success: true, 
            license_key: licenseKey,
            message: '激活成功！'
        });

    } catch (error) {
        console.error('Activation Error:', error);
        return response.status(500).json({ error: 'Internal Server Error: ' + error.message });
    }
}
