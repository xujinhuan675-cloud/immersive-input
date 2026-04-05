import { getCurrentUser } from './auth';
import toast from 'react-hot-toast';

/**
 * 检查用户是否已登录
 * 如果未登录，显示提示并返回 false
 * @returns {boolean} 是否已登录
 */
export function checkAuthAndNotify() {
    const { user, token } = getCurrentUser();
    const isAuthenticated = !!(user && token);
    
    if (!isAuthenticated) {
        toast.error('请先登录后再使用此功能');
        return false;
    }
    
    return true;
}

/**
 * 静默检查用户是否已登录（不显示提示）
 * @returns {boolean} 是否已登录
 */
export function isAuthenticated() {
    const { user, token } = getCurrentUser();
    return !!(user && token);
}
