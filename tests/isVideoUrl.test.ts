import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isVideoUrl } from '../src/forms/mediaShared';

// The `accept` a mixed picker actually passes. It is the case that broke: the
// `acceptsVideo && !acceptsImage` fallback only fires for a video-ONLY picker,
// so a mixed one had nothing left but the extension test.
const MIXED = 'image/*,video/*';

// Short but real: an ISO-BMFF `ftyp` box header, base64'd. No `.mp4` anywhere.
const MP4_BODY = 'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=';

test('a data: video URL is a video', () => {
  assert.equal(isVideoUrl(`data:video/mp4;base64,${MP4_BODY}`, MIXED), true);
  assert.equal(isVideoUrl('data:video/webm;base64,GkXfo59ChoEB', MIXED), true);
  assert.equal(isVideoUrl('data:video/quicktime;base64,AAAAFGZ0eXBxdA==', MIXED), true);
});

test('the mixed image+video picker is the case that regressed', () => {
  // Verbatim from the issue: these returned false and previewed as a broken
  // <img>, because the mp4 lives in the media type, before the comma.
  assert.equal(isVideoUrl('data:video/mp4;base64,AAAAIGZ0eXA', MIXED), true);
  assert.equal(isVideoUrl('data:video/webm;base64,GkXf', MIXED), true);
});

test('a data: image URL is not a video, even in a video-only picker', () => {
  // The media type is authoritative when it is there — it beats the accept
  // guess, which would otherwise call anything in a video-only picker a video.
  assert.equal(isVideoUrl('data:image/png;base64,iVBORw0KGgo=', 'video/*'), false);
  assert.equal(isVideoUrl('data:image/svg+xml;base64,PHN2ZyB4bWxucz0i', MIXED), false);
  assert.equal(isVideoUrl('data:image/x-icon;base64,AAAB', ''), false);
});

test('the data: media type is matched case-insensitively', () => {
  assert.equal(isVideoUrl('DATA:VIDEO/MP4;base64,AAAA', MIXED), true);
  assert.equal(isVideoUrl('Data:Image/Png;base64,AAAA', 'video/*'), false);
});

test('a typeless data: URL has nothing to go on and falls back to accept', () => {
  assert.equal(isVideoUrl('data:,hello', 'video/*'), true, 'video-only picker still guesses video');
  assert.equal(isVideoUrl('data:,hello', MIXED), false, 'a mixed picker cannot guess');
  assert.equal(isVideoUrl('data:;base64,AAAA', MIXED), false);
});

test('extension-shaped URLs keep their existing derivation', () => {
  assert.equal(isVideoUrl('/media/clip.mp4', MIXED), true);
  assert.equal(isVideoUrl('/media/clip.mov?v=2', MIXED), true, 'query after the extension');
  assert.equal(isVideoUrl('/media/clip.m4v#t=10', MIXED), true, 'hash after the extension');
  assert.equal(isVideoUrl('https://cdn.example.com/a/clip.webm', MIXED), true);
  assert.equal(isVideoUrl('/media/photo.png', MIXED), false);
  assert.equal(isVideoUrl('/media/mp4.png', MIXED), false, 'the token must be an extension, not any substring');
});

test('the video-only accept fallback still covers extensionless URLs', () => {
  // How the native-fallback blob: URL is classified — no extension, no data
  // type, so the accept string is all there is.
  const blob = 'blob:http://localhost:5173/8f14e45f-ceea-467a-9575-4a1d1b4b30c9';
  assert.equal(isVideoUrl(blob, 'video/*'), true);
  assert.equal(isVideoUrl(blob, MIXED), false, 'a mixed picker cannot guess');
  assert.equal(isVideoUrl(blob, ''), false, 'an empty accept reads as image');
});

test('an absent URL is never a video', () => {
  assert.equal(isVideoUrl('', 'video/*'), false);
  assert.equal(isVideoUrl(null, 'video/*'), false);
  assert.equal(isVideoUrl(undefined, 'video/*'), false);
});
