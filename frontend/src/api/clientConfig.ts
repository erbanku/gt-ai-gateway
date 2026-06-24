import request from '../utils/request';
import type {
    ApplyClientConfigRequest,
    ClientConfigStatus,
    ClientConfigStatusResponse,
    RestoreClientConfigRequest,
} from '../types/clientConfig';

export async function getClientConfigStatus(): Promise<ClientConfigStatusResponse> {
    return request.get('/client-config/status.json');
}

export async function applyClientConfig(data: ApplyClientConfigRequest): Promise<ClientConfigStatus> {
    return request.post('/client-config/apply.json', data);
}

export async function restoreClientConfig(data: RestoreClientConfigRequest): Promise<ClientConfigStatus> {
    return request.post('/client-config/restore.json', data);
}
