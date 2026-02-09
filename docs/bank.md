# 模拟银行系统 (Bank)

模拟银行系统为 XRPL Token Insurance Demo 提供银行账户管理、资金流转等基础功能。系统支持个人账户和法人账户两种类型，法人账户可开设虚拟账户用于区分不同用途的入金。

## 认证方式

所有需要认证的接口使用 Bearer Token（JWT）方式。通过登录接口获取 token 后，在请求头中携带：

```text
Authorization: Bearer <token>
```

Token 有效期为 24 小时。

---

## 账户体系

### 账户类型

| 类型 | 支店码 | 账户号码格式 | 说明 |
| - | - | - | - |
| 个人账户 | `002` | 7 位递增 (`0000001`~) | 面向个人用户 |
| 法人账户 | `001` | `XXX0000` | 前 3 位为法人编号 (001~999)，后 4 位固定为 0000 |
| 虚拟账户 | `001` | `XXX####` | 前 3 位为所属法人编号，后 4 位为 0001~9999 |

### 虚拟账户

虚拟账户是法人账户的附属功能，用于区分不同来源或用途的入金。

- 仅法人账户可创建虚拟账户
- 虚拟账户本身不持有余额
- 向虚拟账户号码转账时，资金自动归集到对应的法人主账户
- 交易记录中会标注虚拟账户号码和标签，便于法人方对账
- 可通过停用 (`isActive: false`) 来关闭虚拟账户的收款功能
- 停用的虚拟账户无法被 lookup 查询，也无法接收转账

---

## API 一览

基础路径: `/api/v1`

### 账户管理

| Method | 路径 | 认证 | 请求参数 | 说明 |
| - | - | - | - | - |
| POST | `/accounts` | - | `pin`(必须), `accountHolder`(必须), `accountType` | 开设新账户，返回账户信息 |
| POST | `/accounts/login` | - | `branchCode`(必须), `accountNumber`(必须), `pin`(必须) | 登录，返回 JWT token 和账户信息 |
| GET | `/accounts/lookup` | - | query: `branchCode`(必须), `accountNumber`(必须) | 查询账户名义人信息，支持虚拟账户（仅有效的） |
| GET | `/accounts/me` | JWT | - | 获取当前账户信息（不含 PIN） |
| PATCH | `/accounts/me` | JWT | `accountHolder`, `pin`, `oldPin` | 更新名义人或变更 PIN（变更 PIN 需提供 `oldPin`） |

### 虚拟账户管理（仅法人账户，个人账户返回 403）

| Method | 路径 | 认证 | 请求参数 | 说明 |
| - | - | - | - | - |
| POST | `/accounts/me/virtual-accounts` | JWT | `label`(必须) | 创建虚拟账户，返回含分配账户号码的虚拟账户信息 |
| GET | `/accounts/me/virtual-accounts` | JWT | - | 列出当前法人下所有虚拟账户 |
| GET | `/accounts/me/virtual-accounts/:id` | JWT | - | 查看指定虚拟账户详情（仅限自己的） |
| PATCH | `/accounts/me/virtual-accounts/:id` | JWT | `label`, `isActive` | 更新标签或启停虚拟账户 |

### ATM 操作

| Method | 路径 | 认证 | 请求参数 | 说明 |
| - | - | - | - | - |
| POST | `/atm/deposit` | JWT | `amount`(必须), `pin`(必须) | 入金，返回操作后余额 |
| POST | `/atm/withdrawal` | JWT | `amount`(必须), `pin`(必须) | 出金，余额不足返回 400 |

### 转账

| Method | 路径 | 认证 | 请求参数 | 说明 |
| - | - | - | - | - |
| POST | `/transfers` | JWT | `toAccountNumber`(必须), `amount`(必须), `pin`(必须) | 转账到指定账户号码，返回余额和交易 ID |

目标账户号码可以是普通账户或虚拟账户。转入虚拟账户时，资金归集到法人主账户，收款方交易记录附带 `virtualAccountNumber` 和 `virtualAccountLabel`。

### 交易记录

| Method | 路径 | 认证 | 请求参数 | 说明 |
| - | - | - | - | - |
| GET | `/transactions` | JWT | - | 按时间倒序返回当前账户交易记录 |

交易类型: `deposit`(入金)、`withdrawal`(出金)、`transfer_out`(汇出)、`transfer_in`(汇入)。通过虚拟账户汇入的交易包含虚拟账户号码和标签。

### 健康检查

| Method | 路径 | 认证 | 请求参数 | 说明 |
| - | - | - | - | - |
| GET | `/health` | - | - | 返回服务状态 |

---

## 错误处理

API 统一使用以下格式返回错误：

```json
{
  "error": "错误信息"
}
```

常见状态码：

| 状态码 | 说明 |
| - | - |
| 400 | 请求参数错误、余额不足、PIN 码错误等 |
| 401 | 未认证或 token 无效/过期 |
| 403 | 权限不足（如个人账户访问虚拟账户接口） |
| 404 | 资源未找到 |
| 500 | 服务器内部错误 |
