import PropTypes from 'prop-types';
import React from 'react';

import createReactClass from 'create-react-class';

import Avatar from '../avatar';
import TooltipMixin from '../../mixins/tooltip';
import {userDisplayName} from '../../utils/formatters';

const GroupParticipants = createReactClass({
  displayName: 'GroupParticipants',

  propTypes: {
    participants: PropTypes.array.isRequired,
  },

  mixins: [
    TooltipMixin({
      selector: '.tip',
    }),
  ],

  render() {
    let participants = this.props.participants;

    return (
      <div>
        <h6>
          <span>
            {participants.length} {'Participant' + (participants.length === 1 ? '' : 's')}
          </span>
        </h6>
        <ul className="faces">
          {participants.map((user, i) => {
            return (
              <li key={user.username} className="tip" title={userDisplayName(user)}>
                <Avatar size={28} user={user} />
              </li>
            );
          })}
        </ul>
      </div>
    );
  },
});

export default GroupParticipants;
