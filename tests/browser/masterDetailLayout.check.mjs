import assert from 'node:assert/strict';
export const describe = 'MasterDetailLayout preserves real scroll and focus across compact navigation in both themes';
export default async function check(page, { pageErrors }) {
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
    await page.locator('#layout-container').evaluate(element => element.style.width = '960px');
    const separator = page.getByRole('separator');
    await separator.waitFor({ state: 'visible' });
    await separator.focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await separator.getAttribute('aria-valuenow'), theme === 'light' ? '316' : '332');
    await page.getByRole('textbox', { name: 'Filter records' }).fill('Keep filter');
    const item = page.getByRole('button', { name: 'Record 35', exact: true });
    await item.scrollIntoViewIfNeeded();
    const scrollTop = await item.evaluate(element => element.closest('[aria-label="List"]').parentElement.scrollTop);
    assert.ok(scrollTop > 0, 'list must actually have scrolled');
    await item.click();
    await page.locator('#layout-container').evaluate(element => element.style.width = '400px');
    const back = page.getByRole('button', { name: 'Back to list' });
    await back.waitFor({ state: 'visible' });
    assert.equal(await back.evaluate(element => document.activeElement === element), true);
    assert.equal(await page.getByRole('button', { name: 'Record 35', exact: true }).count(), 0, 'hidden list is absent from the accessibility tree');
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('textbox', { name: 'Draft' }).evaluate(element => document.activeElement === element), true);
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Enter');
    await item.waitFor({ state: 'visible' });
    assert.equal(await item.evaluate(element => document.activeElement === element), true);
    assert.equal(await item.evaluate(element => element.closest('[aria-label="List"]').parentElement.scrollTop), scrollTop);
    assert.equal(await page.getByRole('textbox', { name: 'Filter records' }).inputValue(), 'Keep filter');
    assert.equal(await page.locator('[aria-label="Draft"]').inputValue(), 'Keep this draft');
    assert.equal(await page.locator('#layout-container').evaluate(element => element.scrollWidth <= element.clientWidth), true);
  }
  assert.deepEqual(pageErrors, []);
}
