import request from '@/utils/request';

export function welcome(): Promise<any> {
    return request.get('/welcome');
}

export function status(): Promise<any> {
    return request.get('/status.json');
}
