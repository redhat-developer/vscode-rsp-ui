import { AdaptersConstants } from './common/adaptersContants';
import { expect } from 'chai';
import { ActivityBar, SideBarView, ViewControl, Workbench, QuickOpenBox, ExtensionsViewSection, ExtensionsViewItem } from 'vscode-extension-tester';

/**
 * @author Ondrej Dockal <odockal@redhat.com>
 */
export function extensionUIAssetsTest() {
    describe('Verify extension\'s base assets are available after installation', () => {

        let view: ViewControl;
        let sideBar: SideBarView;
        let quickBox: QuickOpenBox;

        before(async function() {
            this.timeout(4000);
            view = new ActivityBar().getViewControl('Extensions');
            sideBar = await view.openView();
            quickBox = await new Workbench().openCommandPrompt();
        });

        it('Command Palette prompt knows RSP commands', async function() {
            this.timeout(30000);
            await verifyCommandPalette(quickBox);
        });

        it('Remote Server Protocol UI extension is installed', async function() {
            this.timeout(5000);
            const section = await sideBar.getContent().getSection('Enabled') as ExtensionsViewSection;
            const item = await section.findItem(`@installed ${AdaptersConstants.RSP_UI_NAME}`) as ExtensionsViewItem;
            expect(item).not.undefined;
        });

        it('Servers activity bar is available', async function() {
            this.timeout(5000);
            const viewControls = await new ActivityBar().getViewControls();
            expect(viewControls.map(item => item.getTitle())).to.include(AdaptersConstants.RSP_CONNECTOR_NAME);
            const serversView = new ActivityBar().getViewControl(AdaptersConstants.RSP_CONNECTOR_NAME);
            expect(serversView).not.undefined;
            const serversBar = await serversView.openView();
            expect(serversBar).not.undefined;
            expect(await serversBar.getTitlePart().getTitle()).to.equal(AdaptersConstants.RSP_ATIVITY_BAR_TITLE);
        });

        it('Action button from Servers activity bar is available', async function() {
            this.timeout(5000);
            const serversView = new ActivityBar().getViewControl(AdaptersConstants.RSP_CONNECTOR_NAME);
            const serversBar = await serversView.openView();
            const titlePart = serversBar.getTitlePart();
            const actionsButton = await titlePart.getActions();
            expect(actionsButton.length).to.equal(1);
            expect(actionsButton[0].getTitle()).to.include('Create New Server');
        });

        it('Servers tab is available under Explorer bar', async function() {
            this.timeout(5000);
            const explorerView = new ActivityBar().getViewControl('Explorer');
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
            expect(actionsButton[0].getLabel()).to.equal(AdaptersConstants.RSP_SERVER_ACTION_BUTTON);
        });

        after(async function() {
            this.timeout(4000);
            if (sideBar && await sideBar.isDisplayed()) {
                sideBar = await new ActivityBar().getViewControl('Extensions').openView();
                const actionButton = await sideBar.getTitlePart().getAction('Clear Extensions Input');
                await actionButton.click();
                view.closeView();
            }
            if (quickBox && await quickBox.isDisplayed()) {
                await quickBox.cancel();
            }
        });
    });
}

async function verifyCommandPalette(quick: QuickOpenBox) {
    if (!quick || ! await quick.isDisplayed()) {
        quick = await new Workbench().openCommandPrompt();
    }
    await quick.setText(`>${AdaptersConstants.RSP_COMMAND}`);
    const options = await quick.getQuickPicks();
    expect(await options[0].getText()).not.equal('No commands matching');
    expect(await options[0].getText()).not.equal('No results found');
    for (const element of AdaptersConstants.RSP_MAIN_COMMANDS) {
        const expression = AdaptersConstants.RSP_COMMAND + ' ' + element;
        await quick.setText(`>${expression}`);
        const option = await quick.getQuickPicks();
        const optionsString = await Promise.all(option.map(item => item.getText()));
        expect(optionsString).to.have.members([expression]);
    };
}
