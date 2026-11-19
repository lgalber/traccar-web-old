import { useDispatch, useSelector } from 'react-redux';
import { Button, Paper, Typography } from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import { useTranslation } from '../common/components/LocalizationProvider';
import { formatAlarm, formatTime } from '../common/util/formatter';
import useMarkSeen from '../common/util/useMarkSeen';
import { devicesActions } from '../store';

const useStyles = makeStyles()((theme, { offset }) => ({
  root: {
    position: 'fixed',
    zIndex: 6,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 'max-content',
    maxWidth: `calc(100vw - ${theme.spacing(4)})`,
    boxSizing: 'border-box',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing(1, 1.5),
    padding: theme.spacing(1, 1, 1, 2),
    backgroundColor: theme.palette.alwaysDark.main,
    color: theme.palette.common.white,
    // Same reason as the rail: keep the dark toast visible on a dark page
    border: theme.palette.mode === 'dark' ? `1px solid ${theme.palette.divider}` : 'none',
    [theme.breakpoints.up('md')]: {
      top: theme.spacing(2),
      left: `calc(50% + ${offset} / 2)`,
    },
    [theme.breakpoints.down('md')]: {
      top: theme.spacing(10),
    },
  },
  message: {
    flex: '1 1 200px',
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1.5),
  },
  dot: {
    width: 10,
    height: 10,
    flex: '0 0 10px',
    borderRadius: 5,
    backgroundColor: '#FB923C',
  },
  text: {
    minWidth: 0,
  },
  more: {
    flexShrink: 0,
    padding: theme.spacing(0.25, 1),
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    fontSize: '0.75rem',
    fontWeight: 700,
  },
  actions: {
    display: 'flex',
    gap: theme.spacing(1),
    marginLeft: 'auto',
  },
  show: {
    flexShrink: 0,
    color: theme.palette.common.white,
    borderColor: 'rgba(255,255,255,0.5)',
    '&:hover': {
      borderColor: theme.palette.common.white,
      backgroundColor: 'rgba(255,255,255,0.08)',
    },
  },
  seen: {
    flexShrink: 0,
    backgroundColor: theme.palette.common.white,
    color: theme.palette.alwaysDark.main,
    '&:hover': {
      backgroundColor: '#E5E7EB',
    },
  },
}));

// Shows the newest unconfirmed alarm on top of the map. It stays until the alarm is marked as seen
// (here, in the device card or on the Alerts page); "Show" only opens the device.
const AlarmToast = ({ offset = '0px' }) => {
  const { classes } = useStyles({ offset });
  const dispatch = useDispatch();
  const t = useTranslation();
  const markSeen = useMarkSeen();

  const devices = useSelector((state) => state.devices.items);
  const alarms = useSelector((state) => state.events.items).filter((e) => e.type === 'alarm');

  const event = alarms[0];
  if (!event) {
    return null;
  }

  return (
    <Paper elevation={9} className={classes.root} role="alert">
      <span className={classes.message}>
        <span className={classes.dot} />
        <Typography variant="body2" className={classes.text}>
          <strong>{formatAlarm(event.attributes.alarm, t)}</strong>
          {` · ${devices[event.deviceId]?.name || ''} · ${formatTime(event.eventTime, 'seconds')}`}
        </Typography>
        {alarms.length > 1 && <span className={classes.more}>{`+${alarms.length - 1}`}</span>}
      </span>
      <span className={classes.actions}>
        <Button
          size="small"
          variant="outlined"
          className={classes.show}
          onClick={() => dispatch(devicesActions.selectId(event.deviceId))}
        >
          {t('reportShow')}
        </Button>
        <Button size="small" className={classes.seen} onClick={() => markSeen([event])}>
          {t('sharedAcknowledge')}
        </Button>
      </span>
    </Paper>
  );
};

export default AlarmToast;
