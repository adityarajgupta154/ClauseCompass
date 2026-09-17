/**
 * Puts the sequential-focus starting point back at the top of the document.
 * Blurring is not enough: the browser carries on from wherever focus was.
 */
export async function restartFromTop(page) {
  await page.evaluate(() => {
    const sentinel = document.createElement("span");
    sentinel.tabIndex = -1;
    sentinel.setAttribute("data-a11y-sentinel", "");
    document.body.prepend(sentinel);
    sentinel.focus();
    sentinel.remove();
    window.scrollTo(0, 0);
  });
}
