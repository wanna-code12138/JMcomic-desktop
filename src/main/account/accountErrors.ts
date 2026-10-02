import type { AccountErrorCode } from '../../shared/accountContracts'

const messages: Record<AccountErrorCode, string> = {
  AUTH_REQUIRED: '请先登录在线账户。', EXPIRED: '在线会话已失效，请重新登录。', CANCELLED: '操作已取消，请刷新后重试。',
  CHALLENGE: '服务要求额外验证，当前功能暂不可用。', RATE_LIMITED: '请求过于频繁，请稍后重试。',
  NETWORK: '暂时无法连接在线服务，请检查网络后重试。', PROTOCOL: '服务返回的数据暂无法识别，请稍后重试。',
  INVALID_INPUT: '输入内容无效，请检查后重试。', INVALID_CREDENTIALS: '登录未成功，请核对账号和密码。',
  STORAGE: '无法安全保存或清除会话，请检查系统加密和数据目录权限。', UNAVAILABLE: '此功能暂不可用，账户的其他功能仍可继续使用。',
  OUTCOME_UNKNOWN: '操作可能已完成，但尚未核实结果。请先刷新查看，避免重复提交。',
  CONFLICT: '远端状态已发生变化，请刷新后确认。', BUSY: '会话正在验证或网络设置正在切换，请稍后重试。', FORBIDDEN: '无法执行此请求。'
}
export class AccountError extends Error {
  constructor(readonly code: AccountErrorCode) { super(messages[code]); this.name = 'AccountError' }
}
export function accountError(error: unknown): AccountError {
  return error instanceof AccountError ? error : new AccountError('NETWORK')
}
