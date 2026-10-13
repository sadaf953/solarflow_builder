export async function loadDeliveryBatches(client, {timeoutMs = 15000} = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let result;
    try {
        result = await client.from('delivery_batches').select('*').order('created_at', {ascending: false}).abortSignal(controller.signal);
    } catch (error) {
        if (controller.signal.aborted) throw new Error('Delivery batches took too long to load. Check your connection and retry.');
        throw error;
    } finally {
        clearTimeout(timeout);
    }
    const {data, error} = result;
    if (controller.signal.aborted) throw new Error('Delivery batches took too long to load. Check your connection and retry.');
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('Delivery batch response was incomplete.');
    return data;
}
