import { AdaptersConstants } from './common/adaptersContants';
import { expect } from 'chai';
import { ActivityBar, SideBarView, ViewControl, Workbench, ExtensionsViewSection, InputBox, WebDriver, VSBrowser, Key, By, TitleActionButton } from 'vscode-extension-tester';

/**
 * @author Ondrej Dockal <odockal@redhat.com>
 */
export function extensionUIAssetsTest() {
    describe('Verify extension\'s base assets are available after installation', () => {

        let view: ViewControl;
        let sideBar: SideBarView;
        let quickBox: InputBox;
        let driver: WebDriver;

        before(async function() {
            this.timeout(4000);
            view = await new ActivityBar().getViewControl('Extensions');
            sideBar = await view.openView();
            driver = VSBrowser.instance.driver;
            if (process.platform === 'darwin') {
                await driver.actions().sendKeys(Key.F1).perform();
                quickBox = await InputBox.create();
            } else {
                quickBox = (await new Workbench().openCommandPrompt()) as InputBox;
            }
        });

        it('Command Palette prompt knows RSP commands', async function() {
            this.timeout(45000);
            await verifyCommandPalette(quickBox);
        });

        it('Remote Server Protocol UI extension is installed', async function() {
            this.timeout(8000);
            const section = await sideBar.getContent().getSection('Installed') as ExtensionsViewSection;
            const item = await section.findItem(`@installed ${AdaptersConstants.RSP_UI_NAME}`);
            expect(item).not.undefined;
        });

        it('Action button "Create New Server..." from Servers tab is available', async function() {
            this.timeout(8000);
            const explorerView = await new ActivityBar().getViewControl('Explorer');
            const bar = await explorerView.openView();
            const content = bar.getContent();
            const section = await content.getSection(AdaptersConstants.RSP_SERVERS_LABEL);
            const actionButton = await section.getAction(AdaptersConstants.RSP_SERVER_ACTION_BUTTON);
            expect(await actionButton.getLabel()).to.equal(AdaptersConstants.RSP_SERVER_ACTION_BUTTON);
        });

        it('Servers tab is available under Explorer bar', async function() {
            this.timeout(8000);
            const explorerView = await new ActivityBar().getViewControl('Explorer');
            expect(explorerView).not.undefined;
            const bar = await explorerView.openView();
            const content = bar.getContent();
            const sections = await content.getSections();
            expect(await Promise.all(sections.map(item => item.getTitle()))).to.include(AdaptersConstants.RSP_SERVERS_LABEL);
            const section = await content.getSection(AdaptersConstants.RSP_SERVERS_LABEL);
            expect(section).not.undefined;
            expect(await section.getTitle()).to.equal(AdaptersConstants.RSP_SERVERS_LABEL);
            const actionsButton = await section.getActions();
            expect(actionsButton.length).to.equal(1);
            expect(await actionsButton[0].getLabel()).to.equal(AdaptersConstants.RSP_SERVER_ACTION_BUTTON);
        });

        after(async function() {
            this.timeout(5000);
            if (sideBar && await sideBar.isDisplayed()) {
                const viewControl = await new ActivityBar().getViewControl('Extensions');
                sideBar = await viewControl.openView();
                const titlePart = sideBar.getTitlePart();
                const actionButton = new TitleActionButton(By.xpath('.//a[@aria-label="Clear Extensions Search Results"]').toString(), titlePart);
                if (actionButton.isEnabled()) {
                    await actionButton.click();
                }
            }
            if (quickBox && await quickBox.isDisplayed()) {
                await quickBox.cancel();
            }
        });
    });
}

async function verifyCommandPalette(input: InputBox) {
    if (!input || ! await input.isDisplayed()) {
        input = await new Workbench().openCommandPrompt() as InputBox;
    }
    await input.setText(`>${AdaptersConstants.RSP_COMMAND}`);
    const options = await input.getQuickPicks();
    expect(await options[0].getText()).not.equal('No commands matching');
    expect(await options[0].getText()).not.equal('No results found');
    for (const element of AdaptersConstants.RSP_MAIN_COMMANDS) {
        const expression = `${AdaptersConstants.RSP_COMMAND  } ${  element}`;
        await input.setText(`>${expression}`);
        const option = await input.getQuickPicks();
        const optionsString = await Promise.all(option.map(item => item.getText()));
        expect(optionsString).to.have.members([expression]);
    }
}
