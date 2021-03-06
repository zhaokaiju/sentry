from __future__ import absolute_import

import responses

from six.moves.urllib.parse import parse_qs

from sentry.utils import json
from sentry.models import OrganizationIntegration, Integration, GroupStatus
from sentry.testutils.cases import RuleTestCase
from sentry.integrations.slack import SlackNotifyServiceAction


class SlackNotifyActionTest(RuleTestCase):
    rule_cls = SlackNotifyServiceAction

    def setUp(self):
        event = self.get_event()

        self.permissions = {
            'ok': True,
            'info': {
                'channel': {
                    'resources': {
                        'wildcard': True,
                        'excluded_ids': [],
                        'ids': [],
                    },
                },
                'im': {
                    'resources': {
                        'ids': ['member-id', 'morty-id'],
                    },
                },
            },
        }

        responses.add(
            method=responses.GET,
            url='https://slack.com/api/apps.permissions.info',
            status=200,
            content_type='application/json',
            body=json.dumps(self.permissions),
        )

        self.integration = Integration.objects.create(
            provider='slack',
            name='Awesome Team',
            external_id='TXXXXXXX1',
            metadata={
                'access_token': 'xoxp-xxxxxxxxx-xxxxxxxxxx-xxxxxxxxxxxx',
                'bot_access_token': 'xoxb-xxxxxxxxx-xxxxxxxxxx-xxxxxxxxxxxx',
            }
        )
        OrganizationIntegration.objects.create(
            organization=event.project.organization,
            integration=self.integration,
        )

    @responses.activate
    def test_applies_correctly(self):
        event = self.get_event()

        rule = self.get_rule(data={
            'workspace': self.integration.id,
            'channel': '#my-channel',
        })

        results = list(rule.after(event=event, state=self.get_state()))
        assert len(results) == 1

        responses.add(
            method=responses.POST,
            url='https://slack.com/api/chat.postMessage',
            body='{"ok": true}',
            status=200,
            content_type='application/json',
        )

        # Trigger rule callback
        results[0].callback(event, futures=[])
        data = parse_qs(responses.calls[0].request.body)

        assert 'attachments' in data
        attachments = json.loads(data['attachments'][0])

        assert len(attachments) == 1
        assert attachments[0]['title'] == event.title

    def test_render_label(self):
        rule = self.get_rule(data={
            'workspace': self.integration.id,
            'channel': '#my-channel',
            'tags': 'one, two'
        })

        assert rule.render_label(
        ) == 'Send a notification to the Awesome Team Slack workspace to #my-channel and include tags [one, two]'

    def test_render_label_without_integration(self):
        self.integration.delete()

        rule = self.get_rule(data={
            'workspace': self.integration.id,
            'channel': '#my-channel',
            'tags': '',
        })

        label = rule.render_label()
        assert label == 'Send a notification to the [removed] Slack workspace to #my-channel and include tags []'

    @responses.activate
    def test_valid_channel_selected(self):
        rule = self.get_rule(data={
            'workspace': self.integration.id,
            'channel': '#my-channel',
            'tags': '',
        })

        channels = {
            'ok': 'true',
            'channels': [
                {'name': 'my-channel', 'id': 'chan-id'},
                {'name': 'other-chann', 'id': 'chan-id'},
            ],
        }

        responses.add(
            method=responses.GET,
            url='https://slack.com/api/channels.list',
            status=200,
            content_type='application/json',
            body=json.dumps(channels),
        )

        form = rule.get_form_instance()
        assert form.is_valid()

    @responses.activate
    def test_valid_member_selected(self):
        rule = self.get_rule(data={
            'workspace': self.integration.id,
            'channel': '@morty',
            'tags': '',
        })

        channels = {
            'ok': 'true',
            'channels': [
                {'name': 'my-channel', 'id': 'chan-id'},
                {'name': 'other-chann', 'id': 'chan-id'},
            ],
        }

        responses.add(
            method=responses.GET,
            url='https://slack.com/api/channels.list',
            status=200,
            content_type='application/json',
            body=json.dumps(channels),
        )

        members = {
            'ok': 'true',
            'members': [
                {'name': 'morty', 'id': 'morty-id'},
                {'name': 'other-user', 'id': 'user-id'},
            ],
        }

        responses.add(
            method=responses.GET,
            url='https://slack.com/api/users.list',
            status=200,
            content_type='application/json',
            body=json.dumps(members),
        )

        form = rule.get_form_instance()
        assert form.is_valid()

    @responses.activate
    def test_invalid_channel_selected(self):
        rule = self.get_rule(data={
            'workspace': self.integration.id,
            'channel': '#my-channel',
            'tags': '',
        })

        channels = {
            'ok': 'true',
            'channels': [{'name': 'other-chann', 'id': 'chan-id'}],
        }

        responses.add(
            method=responses.GET,
            url='https://slack.com/api/channels.list',
            status=200,
            content_type='application/json',
            body=json.dumps(channels),
        )

        responses.add(
            method=responses.GET,
            url='https://slack.com/api/channels.list',
            status=200,
            content_type='application/json',
            body=json.dumps(channels),
        )

        members = {
            'ok': 'true',
            'members': [{'name': 'other-member', 'id': 'member-id'}],
        }

        responses.add(
            method=responses.GET,
            url='https://slack.com/api/users.list',
            status=200,
            content_type='application/json',
            body=json.dumps(members),
        )

        form = rule.get_form_instance()

        assert not form.is_valid()
        assert len(form.errors) == 1

    def test_dont_notify_ignored(self):
        event = self.get_event()
        event.group.status = GroupStatus.IGNORED
        event.group.save()

        rule = self.get_rule(data={
            'workspace': self.integration.id,
            'channel': '#my-channel',
        })

        results = list(rule.after(event=event, state=self.get_state()))
        assert len(results) == 0
