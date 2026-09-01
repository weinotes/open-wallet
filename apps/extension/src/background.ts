/**
 * Copyright 2026 Davey Wong <wgwcko@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * OpenWallet extension — background service worker (MV3).
 *
 * Currently acts as a lightweight message router / bridge placeholder.
 * In a later phase this will host the DApp connection layer
 * (window.ethereum / EIP-1193 provider bridge) and sign-message routing
 * between content scripts and the popup.
 *
 * MV3 service workers are ephemeral — keep state minimal here and let
 * the popup (or chrome.storage) own long-lived data.
 */

const ROUTABLE_TYPES = ['ping', 'dapp:request', 'dapp:connect', 'dapp:accounts'];

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = typeof message === 'string' ? message : message?.type;

  if (type === 'ping') {
    sendResponse({ ok: true, version: '0.1.0' });
    return false; // sync response
  }

  if (typeof type === 'string' && ROUTABLE_TYPES.includes(type)) {
    // Reserved for DApp bridge phase. Acknowledge without handling yet.
    sendResponse({
      ok: false,
      code: 'NOT_IMPLEMENTED',
      message: 'DApp bridge coming soon',
    });
    return false;
  }

  return false; // no async response
});

// Keep the service worker alive-ish during debug via alarm? MV3 discourages
// long-lived workers; nothing needed for the MVP popup.
console.log('[OpenWallet] background service worker ready');
