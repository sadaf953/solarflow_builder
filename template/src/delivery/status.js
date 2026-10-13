export async function updateDeliveryStatus(client, batchId, status, projectIds) {
    const {data, error} = await client.rpc('update_delivery_batch_status_atomic', {
        p_batch_id: batchId, p_new_status: status, p_project_ids: projectIds
    });
    if (error) throw error;
    if (!data?.success) throw new Error('Delivery update was not confirmed. Refresh and try again.');
    return data;
}

async function batchTransaction(client, name, args) {
    const {data, error} = await client.rpc(name, args);
    if (error?.code === 'PGRST202') throw new Error('Delivery batch setup is incomplete. Ask the demo owner to apply the updated SQL 07, then try again.');
    if (error) throw error;
    if (!data?.success) throw new Error('Batch change was not confirmed. Refresh before trying again.');
    return data;
}
export const saveDeliveryBatch = (client, batch, selected, removed) => batchTransaction(client, 'save_delivery_batch_atomic', {
    p_batch: batch, p_selected_project_ids: selected, p_removed_project_ids: removed
});
export const deleteDeliveryBatch = (client, id, projects) => batchTransaction(client, 'delete_delivery_batch_atomic', {
    p_batch_id: id, p_project_ids: projects
});

// Removing a project must commit its link and batch membership together.
// The existing transaction also rejects stale membership and issued stock.
export async function removeDeliveryProject(client, batch, projectId) {
    if (!batch.project_ids?.includes(projectId)) throw new Error('Batch projects changed. Refresh and retry.');
    const remaining = batch.project_ids.filter(id => id !== projectId);
    if (!remaining.length) return deleteDeliveryBatch(client, batch.id, batch.project_ids);
    return saveDeliveryBatch(client, batch, remaining, [projectId]);
}
