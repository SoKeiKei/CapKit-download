const { Redis } = require('@upstash/redis');

// 显式初始化 Redis 客户端
const redis = new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(request, response) {
    if (request.method !== 'POST') return response.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { machine_id } = request.body;
        if (!machine_id) return response.status(400).json({ error: 'Missing machine_id' });

        const cleanMachineId = machine_id.trim();
        const record = await redis.get(`machine:${cleanMachineId}`);

        if (!record) {
            return response.status(404).json({ error: '未找到该设备的激活记录' });
        }

        return response.status(200).json({ 
            success: true, 
            license_key: record.license_key,
            activated_at: record.updated_at 
        });
    } catch (error) {
        return response.status(500).json({ error: error.message });
    }
}
