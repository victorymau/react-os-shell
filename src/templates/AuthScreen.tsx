/**
 * AuthScreen — centered authentication card. `mode` switches between sign-in,
 * registration, and password-reset layouts. Built from Card + FormField +
 * Input + Checkbox + Button. The design-sync preview renders all three modes.
 */
import Card from '../shell/Card';
import Button from '../forms/Button';
import Input from '../forms/Input';
import Checkbox from '../forms/Checkbox';
import FormField from '../forms/FormField';
import { useState } from 'react';

export interface AuthScreenProps {
  mode?: 'login' | 'register' | 'forgot';
}

const COPY = {
  login: { title: 'Welcome back', subtitle: 'Sign in to your account', cta: 'Sign in' },
  register: { title: 'Create your account', subtitle: 'Start your 14-day free trial', cta: 'Create account' },
  forgot: { title: 'Reset password', subtitle: "We'll email you a reset link", cta: 'Send reset link' },
};

export default function AuthScreen({ mode = 'login' }: AuthScreenProps) {
  const [remember, setRemember] = useState(true);
  const c = COPY[mode];

  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-gray-50 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">A</div>
          <h1 className="text-lg font-semibold text-gray-900">{c.title}</h1>
          <p className="text-sm text-gray-500">{c.subtitle}</p>
        </div>

        <Card>
          <form className="space-y-4" onSubmit={e => e.preventDefault()}>
            {mode === 'register' && (
              <FormField label="Name" htmlFor="au-name"><Input id="au-name" placeholder="Alice Nguyen" /></FormField>
            )}
            <FormField label="Email" htmlFor="au-email">
              <Input id="au-email" type="email" placeholder="you@example.com" />
            </FormField>

            {mode !== 'forgot' && (
              <FormField
                label="Password"
                htmlFor="au-pass"
                hint={mode === 'register' ? 'At least 8 characters.' : undefined}
              >
                <Input id="au-pass" type="password" placeholder="••••••••" />
              </FormField>
            )}

            {mode === 'login' && (
              <div className="flex items-center justify-between">
                <Checkbox checked={remember} onChange={setRemember} label="Remember me" />
                <a href="#" className="text-sm text-blue-600 hover:underline">Forgot?</a>
              </div>
            )}

            <Button type="submit" block>{c.cta}</Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-sm text-gray-500">
          {mode === 'register' ? (
            <>Already have an account? <a href="#" className="text-blue-600 hover:underline">Sign in</a></>
          ) : (
            <>New here? <a href="#" className="text-blue-600 hover:underline">Create an account</a></>
          )}
        </p>
      </div>
    </div>
  );
}
