import { act, render, waitFor, waitForText } from './dom';
import { useEffect } from 'react';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AxiosInstance } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { setShellApiClient } from '../src/api/client';
import { WindowManagerProvider, useWindowManager } from '../src/shell/WindowManager';
import { setShellWindowRegistry } from '../src/windowRegistry/types';

const ENTITY_TYPE = 'entity-window-loading-test';
const ENTITY_ID = 'speed';
const SELF_FETCHING_TYPE = 'self-fetching-owner-test';
let selfFetchingRequest: () => Promise<{ name: string }>;

function SelfFetchingOwner() {
  const { error } = useQuery({
    queryKey: ['self-fetching-owner', ENTITY_ID],
    queryFn: selfFetchingRequest,
    retry: false,
  });
  return <div>{error ? 'Owner error' : 'Owner active'}</div>;
}

setShellWindowRegistry({
  [ENTITY_TYPE]: {
    endpoint: '/designs/',
    title: (entity: { name: string }) => entity.name,
    render: (entity: { name: string }) => <div data-testid="entity-detail">{entity.name}</div>,
  },
  [SELF_FETCHING_TYPE]: {
    endpoint: '/self-fetching-owner/',
    selfFetching: true,
    rendersOwnModal: true,
    title: () => 'Self-fetching owner',
    render: () => <SelfFetchingOwner />,
  },
});

function OpenEntityFromSearch() {
  const { openEntity } = useWindowManager();
  useEffect(() => {
    // Command K deliberately has no list-row snapshot.
    openEntity(ENTITY_TYPE, ENTITY_ID, null, 'Speed');
  }, [openEntity]);
  return <div id="taskbar-windows" />;
}

function OpenDraftEntity() {
  const { openEntity } = useWindowManager();
  useEffect(() => {
    // A create window whose caller passed no snapshot. `openEntity` mints the
    // `new-` id; the detail query is deliberately never enabled for one.
    openEntity(ENTITY_TYPE, 'new-1783415283039', undefined, 'New design');
  }, [openEntity]);
  return <div id="taskbar-windows" />;
}

function OpenSelfFetchingEntity() {
  const { openEntity } = useWindowManager();
  useEffect(() => {
    openEntity(SELF_FETCHING_TYPE, ENTITY_ID, { name: 'Snapshot' }, 'Snapshot');
  }, [openEntity]);
  return <div id="taskbar-windows" />;
}

test('Command K entity stays in loading until its detail request resolves', async () => {
  let resolveRequest!: (response: {
    data: { name: string };
    status: number;
    statusText: string;
    headers: Record<string, string>;
    config: Record<string, never>;
  }) => void;
  const request = new Promise<Parameters<typeof resolveRequest>[0]>((resolve) => {
    resolveRequest = resolve;
  });
  setShellApiClient({
    get: () => request,
  } as unknown as AxiosInstance);
  localStorage.setItem('erp_open_windows', '[]');

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const view = render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <WindowManagerProvider>
          <OpenEntityFromSearch />
        </WindowManagerProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );

  await waitForText(/Loading record/);
  assert.doesNotMatch(document.body.textContent ?? '', /not found/i);
  assert.ok(document.querySelector('[role="status"]'), 'the wait is announced');

  await act(async () => {
    resolveRequest({
      data: { name: 'Speed' },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    });
    await request;
  });
  await waitFor(
    () => document.querySelector('[data-testid="entity-detail"]') !== null,
    'the loaded detail never replaced the wait',
  );
  assert.match(document.body.textContent ?? '', /Speed/);
  assert.doesNotMatch(document.body.textContent ?? '', /Loading record|not found/i);

  await act(async () => { view.unmount(); });
  queryClient.clear();
});

test('the shell does not interfere with a self-fetching owner retry', async () => {
  let calls = 0;
  selfFetchingRequest = async () => {
    calls += 1;
    if (calls === 1) throw { response: { status: 404 } };
    return { name: 'Recovered' };
  };
  localStorage.setItem('erp_open_windows', '[]');
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const view = render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <WindowManagerProvider>
          <OpenSelfFetchingEntity />
        </WindowManagerProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );

  await waitForText(/Owner error/);
  assert.equal(calls, 1);

  await queryClient.invalidateQueries({ queryKey: ['self-fetching-owner', ENTITY_ID] });
  await waitFor(() => calls === 2, () => `the owner never refetched; queryFn ran ${calls} time(s)`);
  assert.equal(calls, 2);

  await act(async () => { view.unmount(); });
  queryClient.clear();
});


test('a window whose detail query never runs does not wait on it forever', async () => {
  // A disabled TanStack query is `status: "pending"` / `fetchStatus: "idle"`,
  // so `isPending` stays true for a request that is never going to be made.
  // A draft with no snapshot is one of the three windows opened that way (a
  // duplicate and an unconfigured api client are the others), and reading
  // that as "still loading" strands it on a spinner with no way out.
  let requests = 0;
  setShellApiClient({
    get: () => { requests += 1; return Promise.resolve({ data: {}, status: 200, statusText: 'OK', headers: {}, config: {} }); },
  } as unknown as AxiosInstance);
  localStorage.setItem('erp_open_windows', '[]');

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const view = render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <WindowManagerProvider>
          <OpenDraftEntity />
        </WindowManagerProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );

  await waitForText(/Record not found/);
  assert.equal(requests, 0, 'a draft id is never fetched');
  assert.doesNotMatch(document.body.textContent ?? '', /Loading record/);

  await act(async () => { view.unmount(); });
  queryClient.clear();
});
