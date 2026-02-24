const Redis = require('ioredis');
const nacl = require('tweetnacl');
const naclUtil = require('tweetnacl-util');

// 初始化 Redis 客户端 (复用连接)
let redis;
if (!redis) {
    redis = new Redis(process.env.REDIS_URL);
}

function decodeBase64(s) { return naclUtil.decodeBase64(s); }
function encodeBase64(arr) { return naclUtil.encodeBase64(arr); }
function stringToUint8Array(str) { return naclUtil.decodeUTF8(str); }

function getPrivateKey() {
    const keyStr = process.env.PRIVATE_KEY;
    if (!keyStr) throw new Error('Server configuration error: PRIVATE_KEY not set');
    try {
        return keyStr.includes(',') ? new Uint8Array(keyStr.split(',').map(Number)) : decodeBase64(keyStr);
    } catch (e) {
        throw new Error('Invalid PRIVATE_KEY format');
    }
}

export default async function handler(request, response) {
    if (request.method !== 'POST') return response.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { redeem_code, machine_id } = request.body;
        if (!redeem_code || !machine_id) return response.status(400).json({ error: 'Missing redeem_code or machine_id' });

        const cleanCode = redeem_code.trim();
        const cleanMachineId = machine_id.trim();
        const dbKey = `redeem:${cleanCode}`;
        
        // 从 Redis 获取数据 (ioredis 返回的是 JSON 字符串，需要 parse)
        const recordStr = await redis.get(dbKey);
        const record = recordStr ? JSON.parse(recordStr) : null;

        if (!record) return response.status(404).json({ error: '无效的兑换码' });

        // 校验：如果已使用，必须匹配机器码
        if (record.status === 'used' && record.machine_id !== cleanMachineId) {
            return response.status(403).json({ error: '此兑换码已被其他设备绑定' });
        }

        // 生成激活码
        const seed = getPrivateKey();
        const keyPair = nacl.sign.keyPair.fromSeed(seed);
        const messageBytes = stringToUint8Array(cleanMachineId);
        const signature = nacl.sign.detached(messageBytes, keyPair.secretKey);
        const payload = new Uint8Array(signature.length + messageBytes.length);
        payload.set(signature);
        payload.set(messageBytes, signature.length);
        const licenseKey = encodeBase64(payload);

        // 如果是首次激活，写入双向记录
        if (record.status !== 'used') {
            const newRecord = {
                status: 'used',
                machine_id: cleanMachineId,
                license_key: licenseKey,
                activated_at: new Date().toISOString()
            };
            
            const machineRecord = {
                license_key: licenseKey,
                redeem_code: cleanCode,
                updated_at: new Date().toISOString()
            };

            await Promise.all([
                redis.set(dbKey, JSON.stringify(newRecord)),
                redis.set(`machine:${cleanMachineId}`, JSON.stringify(machineRecord))
            ]);
        }

        return response.status(200).json({ success: true, license_key: licenseKey });
    } catch (error) {
        return response.status(500).json({ error: error.message });
    }
}
