/** User-profile API — calls below proxy to the consumer-supplied apiClient
 *  via setShellApiClient(). Prefs reads/writes go through <ShellPrefsProvider>. */
import apiClient from './client';
export const getMe = () => apiClient.get('/auth/me/').then((r: any) => r.data);
export const updateMe = (patch: any) => apiClient.patch('/auth/me/', patch).then((r: any) => r.data);
export const getNumberingConfigs = () => apiClient.get('/auth/numbering-configs/').then((r: any) => r.data?.results ?? r.data ?? []);
