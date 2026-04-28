/** Game analytics — Minesweeper leaderboard routes through the
 *  consumer-supplied apiClient (see setShellApiClient). */
import apiClient from './client';
export const submitGameScore = (data: { game: string; won: boolean; time_seconds: number; clicks: number }) =>
  apiClient.post(`/analytics/games/${data.game}/scores/`, data).then((r: any) => r.data);
export const getGameLeaderboard = (game: string) =>
  apiClient.get(`/analytics/games/${game}/leaderboard/`).then((r: any) => r.data);
