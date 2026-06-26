import { AuthScreen } from 'react-os-shell';

// AuthScreen — centered auth card. `mode` switches the layout between sign-in,
// registration, and password reset.

export function Login() {
  return <div style={{ height: 560 }}><AuthScreen mode="login" /></div>;
}

export function Register() {
  return <div style={{ height: 560 }}><AuthScreen mode="register" /></div>;
}

export function Forgot() {
  return <div style={{ height: 560 }}><AuthScreen mode="forgot" /></div>;
}
