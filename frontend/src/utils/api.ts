import axios from 'axios';
import { ENV } from './env';

export const api = axios.create({ baseURL: ENV.API_BACKEND_URL });
