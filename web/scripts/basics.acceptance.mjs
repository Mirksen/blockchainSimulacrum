import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { MISSIONS, textOf } from '../src/lib/missions.js';
import { asReturningVisitor, menu, settle } from './workbench.helpers.mjs';

// The Basics course (#/basics) in free play: every scene at 1440 px dark and 390 px light with
// one screenshot each, no horizontal overflow at 320 px, the lucky first roll of scene 4, and
// the skipped scenes 2 and 3 after "I know what a hash is". No mining; remote endpoints refused.
// Titles in the tone of this returning visitor (stored start choice play, later hash): technical.
const SCENES = MISSIONS.filter(mission => mission.view === 'basics')
  .map(mission => ({ id: mission.id, title: textOf(mission.title, 'technical') }));
const HASH_SKIPS = ['see-a-fingerprint', 'change-one-letter'];
const sha = text => createHash('sha256').update(text).digest('hex');

export async function verifyBasics(browser, baseURL, output) {
  assert.equal(SCENES.length, 6, 'Six Basics scenes');
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const errors = [];
  try {
    await context.route(/^https:\/\/(eu\.i\.posthog\.com|api\.proofofwork\.fyi)\//, route => route.abort('connectionrefused'));
    await asReturningVisitor(context);
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(new URL('/#/basics', baseURL).href);
    await page.getByRole('heading', { level: 2, name: SCENES[0].title, exact: true }).waitFor();
    const notice = page.locator('.usage-consent');
    if (await notice.count()) await notice.getByRole('button', { name: 'Opt out', exact: true }).click();
    const status = page.locator('.basics-scene-body > .basics-status');
    const button = name => page.getByRole('button', { name, exact: true });

    // Opens scene `index` from the stepper, then gives it something to show.
    const open = async index => {
      await page.getByRole('button', { name: new RegExp(`^Scene ${index + 1}: `) }).click();
      await page.getByRole('heading', { level: 2, name: SCENES[index].title, exact: true }).waitFor();
      assert.equal(await page.locator('.basics-kicker').innerText(), `Basics · Scene ${index + 1} of ${SCENES.length}`);
      switch (SCENES[index].id) {
        case 'copy-problem':
          await button('Send photo to Bob').click();
          await status.filter({ hasText: 'Bob got a copy. Alice still has hers.' }).waitFor();
          break;
        case 'see-a-fingerprint':
          await page.getByLabel('Your text', { exact: true }).fill('Synthetic note');
          // The current fingerprint and the remembered first one, both of this exact text.
          assert.equal(await page.getByRole('img', { name: `Drawn fingerprint of the hash starting ${sha('Synthetic note').slice(0, 8)}`, exact: true }).count(), 2);
          await status.filter({ hasText: 'Now change the text and watch the fingerprint.' }).waitFor();
          break;
        case 'change-one-letter': {
          await page.getByRole('textbox', { name: 'Your copy' }).fill('Alice pays Bob 11');
          const differ = Number(await page.locator('.basics-compare-count .basics-count strong').innerText());
          assert.ok(differ > 0 && differ <= 64, `One changed character changes the fingerprint: ${differ}`);
          break;
        }
        case 'change-fingerprint':
          // "Learner" hashes to 0…: a lucky first roll, named as such and not counted as the find.
          await page.getByLabel('Your text', { exact: true }).fill('Learner');
          await status.filter({ hasText: 'Lucky roll: 1 in 16 texts starts with 0. Roll again and find another one.' }).waitFor();
          assert.equal(await page.locator('.basics-guess-output .basics-count').innerText(), 'Rolls: 1 · 16 on average');
          assert.equal(await page.getByRole('img', { name: 'Die shows 0', exact: true }).count(), 1);
          assert.equal(await page.getByRole('region', { name: 'Your first proof' }).count(), 0, 'A lucky first roll is no proof');
          break;
        case 'why-guess':
          await button('Run the draw').click();
          await page.locator('.basics-page-line').filter({ hasText: 'Page 2: ' }).waitFor();
          assert.match(await status.innerText(), /^(Hal|Dorian|Laszlo) wins page \d+ after \d+ rolls in total and writes it\. Reward: 1 coin\.$/);
          break;
        case 'sealed-pages':
          await page.getByLabel('Page 1 text', { exact: true }).fill('Alice pays Bob 1000');
          await status.filter({ hasText: 'Page 1 no longer fits its seal, and every page after it builds on it.' }).waitFor();
          assert.deepEqual(await page.locator('.basics-page-status').allInnerTexts(),
            ['Seal no longer fits', 'Broken: built on a broken page', 'Broken: built on a broken page']);
          break;
        default: throw new Error(`No preparation for ${SCENES[index].id}`);
      }
    };

    for (const [theme, width, height] of [['dark', 1440, 900], ['light', 390, 844]]) {
      await page.setViewportSize({ width, height });
      await settle(page);
      if (await page.locator('html').getAttribute('data-theme') !== theme) await menu(page, theme === 'light' ? 'Light theme' : 'Dark theme');
      for (let index = 0; index < SCENES.length; index++) {
        await open(index);
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({ path: join(output, `basics-${index + 1}-${theme}-${width}.png`), fullPage: true });
        if (SCENES[index].id === 'change-fingerprint' && width === 1440) {
          // The next roll is "Learner 1", which does not start with 0.
          await button('Roll').click();
          assert.equal(await page.getByLabel('Your text', { exact: true }).inputValue(), 'Learner 1');
          await status.filter({ hasText: `Starts with ${sha('Learner 1')[0]}, not 0. Roll again.` }).waitFor();
          assert.equal(await page.locator('.basics-guess-output .basics-count').innerText(), 'Rolls: 2 · 16 on average');
        }
      }
    }

    await page.setViewportSize({ width: 320, height: 800 });
    await settle(page);
    for (let index = 0; index < SCENES.length; index++) {
      await open(index);
      const fits = await page.evaluate(() => {
        const course = document.querySelector('section.basics');
        return { viewport: innerWidth, page: document.documentElement.scrollWidth, course: course.scrollWidth, room: course.clientWidth };
      });
      assert.ok(fits.page <= fits.viewport && fits.course <= fits.room, `${SCENES[index].title} fits 320px: ${JSON.stringify(fits)}`);
    }
    // A class link opens the same transfer problem independently of mission state.
    await page.getByRole('link', { name: /Try a fresh chain/ }).click();
    await page.waitForURL(/#\/page-challenge$/);
    const challenge = page.getByRole('region', { name: 'Which seals need replacing?' });
    await challenge.getByLabel('Page 2', { exact: true }).check();
    await challenge.getByLabel('Page 3', { exact: true }).check();
    await challenge.getByRole('textbox').fill('The third page depends on the second.');
    await challenge.getByRole('button', { name: 'Change page 2 and check' }).click();
    await challenge.getByText('Your prediction matches the checks.').waitFor();
    await challenge.getByText('The original seal still fits.').waitFor();
    await challenge.getByText(/Its own seal still fits the stored link/).waitFor();
    await page.reload();
    await challenge.getByText('Pack three boxes', { exact: true }).waitFor();
    assert.equal(await challenge.getByRole('textbox').inputValue(), '');
    await challenge.getByLabel('Page 1', { exact: true }).check();
    await challenge.getByRole('button', { name: 'Change page 2 and check' }).click();
    await challenge.getByText('Compare your selection with the checks above.').waitFor();
    await challenge.getByRole('button', { name: 'Try again' }).click();
    assert.equal(await challenge.getByLabel('Page 1', { exact: true }).isChecked(), false);
    await challenge.getByRole('link', { name: 'Back to Basics' }).click();
    // Free play in the course leaves the missions untouched.
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('proofofwork-missions')).completed), []);

    // "I know what a hash is" from the menu marks the two fingerprint scenes as skipped.
    await page.setViewportSize({ width: 390, height: 844 });
    await settle(page);
    await menu(page, 'Starting point');
    await page.getByRole('button', { name: /^I know what a hash is/ }).click();
    await page.waitForURL(/#\/basics$/);
    await page.getByRole('heading', { level: 2, name: SCENES[0].title, exact: true }).waitFor();
    const words = await page.locator('.basics-step').evaluateAll(steps => steps.map(step => step.getAttribute('aria-label')));
    assert.deepEqual(words, SCENES.map((scene, index) => `Scene ${index + 1}: ${scene.title}, ${index === 0 ? 'now' : HASH_SKIPS.includes(scene.id) ? 'skipped' : 'later'}`));
    assert.deepEqual(await page.locator('.basics-step.is-skipped .basics-step-status').allTextContents(), ['skipped', 'skipped']);
    const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('proofofwork-missions')));
    assert.deepEqual([progress.completed, progress.skipped], [[], HASH_SKIPS]);
    assert.equal(await page.evaluate(() => localStorage.getItem('proofofwork-start')), 'hash');
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: join(output, 'basics-skipped-light-390.png'), fullPage: true });
    await button('Send photo to Bob').click();
    await button('Send coin to Bob').click();
    await button('Send same coin to Carol').click();
    await page.getByRole('switch', { name: 'Shared list' }).check();
    await button('Send coin to Bob').click();
    await button('Send same coin to Carol').click();
    await page.getByRole('region', { name: 'What you learned' }).getByRole('button', { name: 'Continue' }).click();
    const next = page.getByRole('heading', { level: 2, name: SCENES[3].title, exact: true });
    await next.waitFor();
    assert.equal(await page.locator('.basics-step[aria-current="step"]').getAttribute('aria-label'),
      `Scene 4: ${SCENES[3].title}, now`);
    await page.waitForFunction(() => document.activeElement?.matches('.basics-header h2'));
    await page.screenshot({ path: join(output, 'basics-continue-after-skip-390.png'), fullPage: true });

    // A skipped scene stays open to do later.
    await page.getByRole('button', { name: /^Scene 2: / }).click();
    await page.getByRole('heading', { level: 2, name: SCENES[1].title, exact: true }).waitFor();
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
  return ['Basics: six scenes with their first results at 1440 px dark and 390 px light, one screenshot each; no horizontal overflow at 320 px; free play leaves the missions untouched',
    'Basics: "Learner" is a lucky first roll that is named and not counted, the next roll is not; "I know what a hash is" skips scenes 2 and 3 when continuing and keeps them open from the stepper'];
}
