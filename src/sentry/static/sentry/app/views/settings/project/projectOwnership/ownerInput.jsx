import PropTypes from 'prop-types';
import React from 'react';
import styled from 'react-emotion';
import TextareaAutosize from 'react-autosize-textarea';

import {Client} from '../../../../api';
import memberListStore from '../../../../stores/memberListStore';
import ProjectsStore from '../../../../stores/projectsStore';
import Button from '../../../../components/buttons/button';
import SentryTypes from '../../../../proptypes';

import {addErrorMessage, addSuccessMessage} from '../../../../actionCreators/indicator';
import {t} from '../../../../locale';
import RuleBuilder from './ruleBuilder';

const SyntaxOverlay = styled.div`
  margin: 5px;
  padding: 0px;
  width: calc(100% - 10px);
  height: 1em;
  background-color: red;
  opacity: 0.1;
  pointer-events: none;
  position: absolute;
  top: ${({line}) => line}em;
`;

const SaveButton = styled.div`
  text-align: end;
  padding-top: 10px;
`;

class OwnerInput extends React.Component {
  static propTypes = {
    organization: SentryTypes.Organization,
    project: SentryTypes.Project,
    initialText: PropTypes.string,
  };

  constructor(props) {
    super(props);
    this.state = {
      text: props.initialText,
      initialText: props.initialText,
      error: null,
    };
  }

  componentWillReceiveProps({initialText}) {
    if (initialText != this.state.initialText) {
      this.setState({initialText});
    }
  }

  parseError(error) {
    let text = error && error.raw && error.raw[0];
    if (!text) {
      return null;
    }
    if (text.startsWith('Invalid rule owners:')) {
      return text;
    } else {
      return <SyntaxOverlay line={text.match(/line (\d*),/)[1] - 1} />;
    }
  }

  handleUpdateOwnership = () => {
    let {organization, project} = this.props;
    let {text} = this.state;
    this.setState({error: null});

    const api = new Client();
    let request = api.requestPromise(
      `/projects/${organization.slug}/${project.slug}/ownership/`,
      {
        method: 'PUT',
        data: {raw: text || ''},
      }
    );

    request
      .then(() => {
        addSuccessMessage(t('Updated ownership rules'));
        this.setState({
          initialText: text,
        });
      })
      .catch(error => {
        this.setState({error: error.responseJSON});
        if (error.status === 403) {
          addErrorMessage(
            t("You don't have permission to modify ownership rules for this project")
          );
        } else if (
          error.status === 400 &&
          error.responseJSON.raw &&
          error.responseJSON.raw[0].startsWith('Invalid rule owners:')
        ) {
          addErrorMessage(
            t('Unable to save ownership rules changes: ' + error.responseJSON.raw[0])
          );
        } else {
          addErrorMessage(t('Unable to save ownership rules changes'));
        }
      });

    return request;
  };

  mentionableUsers() {
    return memberListStore.getAll().map(member => ({
      id: member.id,
      display: member.email,
      email: member.email,
    }));
  }

  mentionableTeams() {
    let {project} = this.props;
    return (ProjectsStore.getAll().find(p => p.slug == project.slug) || {
      teams: [],
    }).teams.map(team => ({
      id: team.id,
      display: `#${team.slug}`,
      email: team.id,
    }));
  }

  onChange(e) {
    this.setState({text: e.target.value});
  }

  handleAddRule(rule) {
    this.setState(
      ({text}) => ({
        text: text + '\n' + rule,
      }),
      this.handleUpdateOwnership
    );
  }

  render() {
    let {project, organization} = this.props;
    let {text, error, initialText} = this.state;

    return (
      <React.Fragment>
        <RuleBuilder
          organization={organization}
          project={project}
          onAddRule={this.handleAddRule.bind(this)}
        />
        <div
          style={{position: 'relative'}}
          onKeyDown={e => {
            if (e.metaKey && e.key == 'Enter') {
              this.handleUpdateOwnership();
            }
          }}
        >
          <TextareaAutosize
            placeholder={
              '#example usage\n\npath:src/example/pipeline/* person@sentry.io #infrastructure\n\nurl:http://example.com/settings/* #product'
            }
            style={{
              padding: '5px 5px 0',
              minHeight: 140,
              overflow: 'auto',
              outline: 0,
              border: '1 solid',
              width: '100%',
              resize: 'none',
              margin: 0,
              fontFamily: 'Monaco, Consolas, "Courier New", monospace',
              wordBreak: 'break-all',
              whiteSpace: 'pre-wrap',
            }}
            onChange={this.onChange.bind(this)}
            value={text}
            spellCheck="false"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />
          {this.parseError(error)}
          <SaveButton>
            <Button
              size="small"
              priority="primary"
              onClick={this.handleUpdateOwnership}
              disabled={text === initialText}
            >
              {t('Save Changes')}
            </Button>
          </SaveButton>
        </div>
      </React.Fragment>
    );
  }
}

export default OwnerInput;
