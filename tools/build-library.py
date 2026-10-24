#!/usr/bin/env python3
"""Builds public/data/exercises.json from the compact table below.

Run: python3 tools/build-library.py
Edit the table to add exercises; ids are permanent (plans reference them).
Each row: id, name, category, muscles, equipment tokens, progression types,
          steps, cues, mistakes, tags, aliases
Equipment tokens: none, dumbbell, kettlebell, barbell, band, pullup_bar, bench,
mat, rope, treadmill, cycle, rower, gym_machine, cable, track, stairs, pool,
cycle_route, bow.
"""
import json, os

E = []
def ex(id, name, cat, muscles, equip, prog, steps, cues, mistakes, tags=(), aliases=()):
    E.append(dict(id=id, name=name, aliases=list(aliases), category=cat, muscles=muscles.split(', '),
                  equipment=equip, progressionTypes=prog, instructions=steps, cues=cues,
                  mistakes=mistakes, tags=list(tags), videos=[]))

# ---------------- Push ----------------
ex('pushup', 'Push-up', 'Strength', 'chest, triceps, front shoulders, core', ['none'], ['reps', 'variation'],
   ['Hands slightly wider than shoulders, body in one straight line.', 'Lower until your chest is a fist above the floor.', 'Press back up to straight arms.'],
   ['Squeeze glutes so hips stay level', 'Elbows about 45° from the body'], ['Sagging hips', 'Half reps', 'Flared elbows'],
   ['push', 'bodyweight'], ['press-up'])
ex('knee_pushup', 'Knee push-up', 'Strength', 'chest, triceps, front shoulders', ['none'], ['reps'],
   ['Knees on the floor, body straight from knees to head.', 'Lower the chest towards the floor.', 'Press back up.'],
   ['Keep hips in line with the body'], ['Bending at the hips'], ['push', 'bodyweight', 'beginner'])
ex('incline_pushup', 'Incline push-up', 'Strength', 'chest, triceps, front shoulders', ['none'], ['reps', 'variation'],
   ['Hands on a sturdy table, bench or step.', 'Walk feet back until the body is straight.', 'Lower the chest to the edge and press away.'],
   ['Lower surface = harder'], ['Using a surface that can slide'], ['push', 'bodyweight', 'beginner'])
ex('decline_pushup', 'Decline push-up', 'Strength', 'upper chest, shoulders, triceps', ['none'], ['reps'],
   ['Feet on a step or bed, hands on the floor.', 'Lower the chest under control.', 'Press back up.'],
   ['Keep the core braced'], ['Head dropping first'], ['push', 'bodyweight', 'advanced'])
ex('pike_pushup', 'Pike push-up', 'Strength', 'shoulders, triceps', ['none'], ['reps', 'variation'],
   ['Hips high in an inverted V.', 'Bend the elbows to bring the head towards the floor between the hands.', 'Press back up.'],
   ['Look at your feet'], ['Turning it into a regular push-up'], ['push', 'bodyweight'])
ex('diamond_pushup', 'Diamond push-up', 'Strength', 'triceps, chest', ['none'], ['reps'],
   ['Hands together under the chest, thumbs and fingers forming a diamond.', 'Lower with elbows close to the ribs.', 'Press up.'],
   ['Elbows stay tucked'], ['Hips sagging'], ['push', 'arms', 'bodyweight'])
ex('chair_dip', 'Chair dip', 'Strength', 'triceps, chest', ['none'], ['reps'],
   ['Hands on the edge of a sturdy chair behind you, legs out.', 'Bend the elbows to about 90°.', 'Press back up.'],
   ['Shoulders down, away from ears'], ['Going too deep with sore shoulders'], ['push', 'arms', 'bodyweight'], ['bench dip'])
ex('db_bench_press', 'Dumbbell bench press', 'Strength', 'chest, triceps, front shoulders', ['dumbbell', 'bench'], ['load'],
   ['Lie on the bench, dumbbells over the chest.', 'Lower to chest level, elbows about 45°.', 'Press back up until arms are straight.'],
   ['Feet planted, shoulder blades squeezed'], ['Bouncing at the bottom'], ['push'], ['dumbbell chest press'])
ex('db_floor_press', 'Dumbbell floor press', 'Strength', 'chest, triceps', ['dumbbell'], ['load'],
   ['Lie on the floor, knees bent, dumbbells over the chest.', 'Lower until the upper arms touch the floor.', 'Press up.'],
   ['Pause briefly on the floor'], ['Letting elbows crash down'], ['push'], ['chest press on the floor'])
ex('db_incline_press', 'Incline dumbbell press', 'Strength', 'upper chest, shoulders', ['dumbbell', 'bench'], ['load'],
   ['Bench at 30–45°.', 'Lower dumbbells to upper chest.', 'Press up and slightly in.'],
   ['Wrists stacked over elbows'], ['Too steep an angle'], ['push'])
ex('db_fly', 'Dumbbell fly', 'Strength', 'chest', ['dumbbell', 'bench'], ['load'],
   ['Lie on the bench, arms up with a soft bend.', 'Open the arms wide in an arc.', 'Squeeze back together.'],
   ['Keep the elbow bend fixed'], ['Going too heavy'], ['push'])
ex('barbell_bench_press', 'Barbell bench press', 'Strength', 'chest, triceps, shoulders', ['barbell', 'bench'], ['load'],
   ['Grip slightly wider than shoulders.', 'Lower the bar to mid-chest.', 'Press to straight arms.'],
   ['Use a spotter or safety pins'], ['Bouncing the bar'], ['push', 'gym'])
ex('db_overhead_press', 'Dumbbell overhead press', 'Strength', 'shoulders, triceps', ['dumbbell'], ['load'],
   ['Dumbbells at shoulder height.', 'Press overhead to straight arms.', 'Lower under control.'],
   ['Ribs down, glutes tight'], ['Arching the lower back'], ['push'], ['shoulder press'])
ex('db_lateral_raise', 'Lateral raise', 'Strength', 'side shoulders', ['dumbbell'], ['load'],
   ['Dumbbells at your sides.', 'Raise out to shoulder height, slight bend in elbows.', 'Lower slowly.'],
   ['Lead with the elbows'], ['Swinging'], ['push', 'shoulders'])
ex('band_chest_press', 'Band chest press', 'Strength', 'chest, triceps', ['band'], ['variation', 'reps'],
   ['Band behind your back at chest height.', 'Press forward to straight arms.', 'Return slowly.'],
   ['Stagger the stance for balance'], ['Letting the band snap back'], ['push', 'band'])

# ---------------- Pull ----------------
ex('pullup', 'Pull-up', 'Strength', 'lats, upper back, biceps, grip', ['pullup_bar'], ['reps', 'load', 'variation'],
   ['Hang from the bar, hands just wider than shoulders, palms away.', 'Pull until the chin clears the bar.', 'Lower to straight arms.'],
   ['Start each rep by pulling the shoulders down'], ['Kipping', 'Half reps'], ['pull'], ['chin-up bar pull-up'])
ex('weighted_pullup', 'Weighted pull-up', 'Strength', 'lats, upper back, biceps, grip', ['pullup_bar', 'dumbbell'], ['load'],
   ['Hold a dumbbell between the feet or use a belt.', 'Pull until the chin clears the bar.', 'Lower fully.'],
   ['Only once 10+ clean pull-ups are easy'], ['Swinging the weight'], ['pull', 'advanced'])
ex('band_assisted_pullup', 'Band-assisted pull-up', 'Strength', 'lats, upper back, biceps', ['pullup_bar', 'band'], ['variation', 'reps'],
   ['Loop a band over the bar and put a knee or foot in it.', 'Pull up until the chin clears the bar.', 'Lower under control.'],
   ['Thinner band = harder'], ['Bouncing out of the bottom'], ['pull', 'beginner'])
ex('negative_pullup', 'Negative pull-up', 'Strength', 'lats, biceps', ['pullup_bar'], ['reps', 'duration'],
   ['Jump or step to the top position.', 'Lower yourself as slowly as you can.', 'Reset and repeat.'],
   ['Aim for 3–5 seconds down'], ['Dropping fast at the end'], ['pull', 'beginner'])
ex('chinup', 'Chin-up', 'Strength', 'lats, biceps', ['pullup_bar'], ['reps', 'load'],
   ['Palms facing you, shoulder width.', 'Pull until the chin clears the bar.', 'Lower fully.'],
   ['Chest towards the bar'], ['Craning the neck'], ['pull'])
ex('dead_hang', 'Dead hang', 'Strength', 'grip, shoulders', ['pullup_bar'], ['duration'],
   ['Hang from the bar with straight arms.', 'Shoulders active, not shrugged to the ears.', 'Hold for time.'],
   ['Breathe slowly'], ['Letting go abruptly'], ['pull', 'grip'])
ex('inverted_row', 'Inverted row', 'Strength', 'upper back, biceps', ['none'], ['reps', 'variation'],
   ['Lie under a sturdy table, grip the edge.', 'Body straight, pull the chest to the edge.', 'Lower slowly.'],
   ['Check the table is stable first'], ['Hips sagging'], ['pull', 'bodyweight'], ['table row'])
ex('db_row', 'Single-arm dumbbell row', 'Strength', 'lats, upper back, biceps', ['dumbbell'], ['load'],
   ['One hand and knee on a bench or chair, back flat.', 'Pull the dumbbell to your hip.', 'Lower to a full stretch.'],
   ['Elbow close to the body'], ['Twisting the torso'], ['pull'], ['dumbbell row'])
ex('db_bent_over_row', 'Bent-over dumbbell row', 'Strength', 'upper back, lats', ['dumbbell'], ['load'],
   ['Hinge forward, back flat, dumbbells hanging.', 'Row both to the ribs.', 'Lower slowly.'],
   ['Neck in line with the spine'], ['Rounding the back'], ['pull'])
ex('db_pullover', 'Dumbbell pullover', 'Strength', 'lats, chest', ['dumbbell'], ['load'],
   ['Lie on a bench or the floor holding one dumbbell over the chest.', 'Lower it in an arc behind the head.', 'Pull it back over the chest.'],
   ['Slight bend in the elbows'], ['Arching the lower back'], ['pull'])
ex('band_row', 'Band row', 'Strength', 'upper back, lats, biceps', ['band'], ['variation', 'reps'],
   ['Anchor the band at chest height or loop it round your feet.', 'Pull the hands to the ribs.', 'Return slowly.'],
   ['Squeeze the shoulder blades'], ['Shrugging'], ['pull', 'band'])
ex('band_pull_apart', 'Band pull-apart', 'Strength', 'rear shoulders, upper back', ['band'], ['variation', 'reps'],
   ['Hold the band at shoulder height, arms straight.', 'Pull it apart to the chest.', 'Return slowly.'],
   ['Ribs down'], ['Bending the elbows a lot'], ['pull', 'band', 'posture'])
ex('band_face_pull', 'Band face pull', 'Strength', 'rear shoulders, rotator cuff', ['band'], ['variation', 'reps'],
   ['Anchor the band at head height.', 'Pull towards the forehead, elbows high.', 'Return slowly.'],
   ['Finish with thumbs pointing back'], ['Leaning back'], ['pull', 'band', 'shoulders'])
ex('lat_pulldown', 'Lat pulldown', 'Strength', 'lats, biceps', ['gym_machine'], ['load'],
   ['Sit with thighs under the pad.', 'Pull the bar to the upper chest.', 'Return with control.'],
   ['Lean back slightly'], ['Pulling behind the neck'], ['pull', 'gym'])
ex('barbell_row', 'Barbell row', 'Strength', 'upper back, lats', ['barbell'], ['load'],
   ['Hinge forward, back flat.', 'Row the bar to the lower ribs.', 'Lower under control.'],
   ['Brace the core'], ['Jerking the weight'], ['pull', 'gym'])
ex('farmer_hold', "Farmer's hold", 'Strength', 'grip, traps, core', ['dumbbell'], ['load', 'duration'],
   ['Stand tall with a heavy dumbbell in each hand.', 'Shoulders back, grip hard.', 'Hold or walk for time.'],
   ['Breathe; do not shrug'], ['Leaning to one side'], ['pull', 'grip'], ["farmer's walk"])

# ---------------- Legs ----------------
ex('bodyweight_squat', 'Bodyweight squat', 'Strength', 'quads, glutes', ['none'], ['reps'],
   ['Feet shoulder width apart.', 'Sit down between your heels, chest up.', 'Stand tall.'],
   ['Knees track over toes'], ['Heels lifting'], ['legs', 'bodyweight', 'beginner'], ['air squat'])
ex('goblet_squat', 'Goblet squat', 'Strength', 'quads, glutes, core', ['dumbbell'], ['load'],
   ['Hold one dumbbell vertically against the chest.', 'Squat between your heels.', 'Drive up through the whole foot.'],
   ['Elbows inside the knees at the bottom'], ['Rounding the back'], ['legs'])
ex('kb_goblet_squat', 'Kettlebell goblet squat', 'Strength', 'quads, glutes', ['kettlebell'], ['load'],
   ['Hold the kettlebell by the horns at the chest.', 'Squat between your heels.', 'Stand tall.'],
   ['Chest up'], ['Knees caving in'], ['legs'])
ex('reverse_lunge', 'Reverse lunge', 'Strength', 'quads, glutes', ['none'], ['reps'],
   ['Step one foot back.', 'Lower until both knees are about 90°.', 'Push back to standing; alternate.'],
   ['Front knee over the ankle'], ['Short steps'], ['legs', 'bodyweight'])
ex('db_lunge', 'Dumbbell lunge', 'Strength', 'quads, glutes', ['dumbbell'], ['load'],
   ['Dumbbells at your sides.', 'Step back or forward into a lunge.', 'Drive back up; alternate legs.'],
   ['Torso upright'], ['Knee slamming the floor'], ['legs'])
ex('db_split_squat', 'Dumbbell split squat', 'Strength', 'quads, glutes', ['dumbbell'], ['load'],
   ['Staggered stance, dumbbells at your sides.', 'Lower the back knee towards the floor.', 'Stand up; finish one side then switch.'],
   ['Weight over the front foot'], ['Back knee doing the work'], ['legs'])
ex('bulgarian_split_squat', 'Bulgarian split squat', 'Strength', 'quads, glutes', ['dumbbell'], ['load', 'reps'],
   ['Back foot on a bench or chair.', 'Lower straight down.', 'Drive up through the front heel.'],
   ['Hop the front foot out far enough'], ['Leaning forward too much'], ['legs', 'advanced'])
ex('db_rdl', 'Dumbbell Romanian deadlift', 'Strength', 'hamstrings, glutes, back', ['dumbbell'], ['load'],
   ['Dumbbells in front of the thighs.', 'Hinge at the hips, soft knees, back flat.', 'Stand by squeezing the glutes.'],
   ['Dumbbells slide down the legs'], ['Rounding the back'], ['legs', 'hinge'], ['RDL'])
ex('glute_bridge', 'Glute bridge', 'Strength', 'glutes, hamstrings', ['mat'], ['reps', 'duration'],
   ['Lie on your back, knees bent, feet flat.', 'Drive hips up until in line with the knees.', 'Lower slowly.'],
   ['Squeeze glutes at the top'], ['Arching the lower back'], ['legs', 'bodyweight', 'beginner'])
ex('single_leg_glute_bridge', 'Single-leg glute bridge', 'Strength', 'glutes, hamstrings', ['mat'], ['reps'],
   ['One foot down, other leg straight.', 'Drive the hips up.', 'Lower; finish one side then switch.'],
   ['Hips stay level'], ['Twisting'], ['legs', 'bodyweight'])
ex('db_hip_thrust', 'Dumbbell hip thrust', 'Strength', 'glutes', ['dumbbell', 'bench'], ['load'],
   ['Upper back on a bench, dumbbell on the hips.', 'Drive hips up to a straight line.', 'Lower under control.'],
   ['Chin tucked'], ['Hyperextending the back'], ['legs'])
ex('step_up', 'Step-up', 'Strength', 'quads, glutes', ['none'], ['reps', 'load'],
   ['Stand facing a sturdy step or bench.', 'Step up and stand tall.', 'Step down slowly; alternate.'],
   ['Push through the top foot only'], ['Pushing off the bottom foot'], ['legs'])
ex('wall_sit', 'Wall sit', 'Strength', 'quads', ['none'], ['duration'],
   ['Back flat on a wall.', 'Slide down until thighs are parallel to the floor.', 'Hold.'],
   ['Knees over ankles'], ['Hands on the thighs'], ['legs', 'isometric'])
ex('calf_raise', 'Calf raise', 'Strength', 'calves', ['none'], ['reps'],
   ['Stand on a step edge, heels hanging.', 'Rise onto the toes.', 'Lower below the step.'],
   ['Pause at the top'], ['Bouncing'], ['legs'])
ex('db_calf_raise', 'Dumbbell calf raise', 'Strength', 'calves', ['dumbbell'], ['load'],
   ['Hold dumbbells, stand on a step edge.', 'Rise onto the toes.', 'Lower slowly.'],
   ['Full range'], ['Bent knees'], ['legs'])
ex('kb_swing', 'Kettlebell swing', 'Strength', 'glutes, hamstrings, back', ['kettlebell'], ['load'],
   ['Hinge and hike the bell between the legs.', 'Snap the hips forward to float it to chest height.', 'Let it fall and hinge again.'],
   ['Power comes from the hips'], ['Squatting the swing', 'Lifting with the arms'], ['legs', 'hinge', 'power'])
ex('barbell_squat', 'Barbell back squat', 'Strength', 'quads, glutes, back', ['barbell'], ['load'],
   ['Bar on the upper back.', 'Squat to depth with a braced core.', 'Drive up.'],
   ['Use safety pins'], ['Knees caving'], ['legs', 'gym'])
ex('barbell_deadlift', 'Barbell deadlift', 'Strength', 'hamstrings, glutes, back', ['barbell'], ['load'],
   ['Bar over mid-foot, grip outside the knees.', 'Brace and stand up, bar close to the legs.', 'Lower the same path.'],
   ['Push the floor away'], ['Rounding the lower back'], ['legs', 'hinge', 'gym'])
ex('leg_press', 'Leg press', 'Strength', 'quads, glutes', ['gym_machine'], ['load'],
   ['Feet shoulder width on the plate.', 'Lower until knees are about 90°.', 'Press without locking the knees.'],
   ['Lower back on the pad'], ['Locking out hard'], ['legs', 'gym'])

# ---------------- Arms ----------------
ex('db_bicep_curl', 'Bicep curl', 'Strength', 'biceps', ['dumbbell'], ['load'],
   ['Dumbbells at your sides, palms forward.', 'Curl up without swinging.', 'Lower slowly.'],
   ['Elbows pinned to your sides'], ['Swinging the body'], ['arms'], ['dumbbell curl'])
ex('db_hammer_curl', 'Hammer curl', 'Strength', 'biceps, forearms', ['dumbbell'], ['load'],
   ['Palms facing each other.', 'Curl up.', 'Lower slowly.'],
   ['Wrists neutral'], ['Swinging'], ['arms'])
ex('db_tricep_kickback', 'Triceps kickback', 'Strength', 'triceps', ['dumbbell'], ['load'],
   ['Hinge forward, upper arm parallel to the floor.', 'Straighten the elbow fully and squeeze.', 'Return slowly.'],
   ['Upper arm stays still'], ['Swinging the dumbbell'], ['arms'])
ex('db_overhead_tricep_extension', 'Overhead triceps extension', 'Strength', 'triceps', ['dumbbell'], ['load'],
   ['Hold one dumbbell overhead with both hands.', 'Lower behind the head.', 'Extend back up.'],
   ['Elbows point forward'], ['Flaring elbows'], ['arms'])
ex('band_curl', 'Band curl', 'Strength', 'biceps', ['band'], ['variation', 'reps'],
   ['Stand on the band, handles in hand.', 'Curl up.', 'Lower slowly.'],
   ['Elbows still'], ['Leaning back'], ['arms', 'band'])

# ---------------- Core ----------------
ex('plank', 'Plank', 'Core', 'abs, deep core, shoulders', ['mat'], ['duration'],
   ['Forearms down, elbows under shoulders.', 'Body in one straight line, glutes squeezed.', 'Hold and breathe.'],
   ['Push the floor away'], ['Hips too high or sagging'], ['core', 'isometric'])
ex('side_plank', 'Side plank', 'Core', 'obliques, hips', ['mat'], ['duration'],
   ['Elbow under the shoulder, legs stacked.', 'Lift the hips into a straight line.', 'Hold; do both sides.'],
   ['Top hip forward slightly'], ['Hips dropping'], ['core', 'isometric'])
ex('dead_bug', 'Dead bug', 'Core', 'deep core', ['mat'], ['reps'],
   ['On your back, arms up, knees over hips.', 'Lower opposite arm and leg while the lower back stays down.', 'Return; alternate.'],
   ['Exhale as you extend'], ['Lower back lifting'], ['core', 'beginner'])
ex('bird_dog', 'Bird dog', 'Core', 'deep core, glutes, back', ['mat'], ['reps'],
   ['On hands and knees.', 'Reach opposite arm and leg long.', 'Hold a second; alternate.'],
   ['Keep the hips level'], ['Rushing'], ['core', 'beginner'])
ex('hollow_hold', 'Hollow hold', 'Core', 'abs', ['mat'], ['duration'],
   ['On your back, lower back pressed down.', 'Lift shoulders and legs a few inches.', 'Hold.'],
   ['Bend the knees to make it easier'], ['Lower back arching'], ['core', 'isometric'])
ex('leg_raise', 'Leg raise', 'Core', 'lower abs, hip flexors', ['mat'], ['reps', 'variation'],
   ['On your back, hands under the hips.', 'Raise the legs to vertical.', 'Lower without arching the back.'],
   ['Slow on the way down'], ['Using momentum'], ['core'])
ex('russian_twist', 'Russian twist', 'Core', 'obliques', ['mat'], ['reps', 'load'],
   ['Sit leaning back, feet down or raised.', 'Rotate the torso side to side.', 'Optionally hold a dumbbell.'],
   ['Rotate from the ribs'], ['Rounding the back'], ['core'])
ex('mountain_climber', 'Mountain climber', 'Core', 'core, shoulders, conditioning', ['none'], ['duration', 'reps'],
   ['Start in a push-up position.', 'Drive knees towards the chest alternately.', 'Keep hips low.'],
   ['Steady rhythm'], ['Hips bouncing'], ['core', 'conditioning'])
ex('bicycle_crunch', 'Bicycle crunch', 'Core', 'abs, obliques', ['mat'], ['reps'],
   ['On your back, hands by the head.', 'Bring opposite elbow and knee together.', 'Alternate slowly.'],
   ['Do not pull on the neck'], ['Rushing'], ['core'])
ex('pallof_press', 'Band Pallof press', 'Core', 'obliques, deep core', ['band'], ['variation', 'reps'],
   ['Band anchored at chest height to your side.', 'Press the hands straight out and resist the twist.', 'Return.'],
   ['Hips and shoulders square'], ['Rotating towards the anchor'], ['core', 'band'])

# ---------------- Cardio / running ----------------
ex('brisk_walk', 'Brisk walk', 'Cardio', 'heart and lungs, legs', ['none'], ['duration', 'distance'],
   ['Walk at a pace where talking is possible but singing is not.', 'Swing the arms.', 'Keep going for the time.'],
   ['Tall posture'], ['Starting too fast'], ['cardio', 'low-impact', 'beginner'])
ex('easy_jog', 'Easy jog', 'Running', 'heart and lungs, legs', ['none'], ['duration', 'distance', 'pace'],
   ['Warm up with 3 minutes of brisk walking.', 'Jog at a conversational pace.', 'Walk breaks are fine early on.'],
   ['Short, quick steps'], ['Going too fast'], ['cardio', 'running'])
ex('run_walk_intervals', 'Run–walk intervals', 'Running', 'heart and lungs, legs', ['none'], ['duration', 'variation'],
   ['Alternate running and walking for set times.', 'Run at an easy pace.', 'Walk briskly to recover.'],
   ['Finish feeling you could do more'], ['Sprinting the run parts'], ['cardio', 'running', 'beginner'])
ex('tempo_run', 'Tempo run', 'Running', 'heart and lungs, legs', ['track'], ['distance', 'pace'],
   ['Warm up 10 minutes.', 'Run the distance at a comfortably hard pace.', 'Cool down with easy jogging.'],
   ['Even pacing'], ['Starting too fast'], ['cardio', 'running'])
ex('sprint_intervals', 'Sprint intervals', 'Running', 'legs, power, heart and lungs', ['track'], ['distance', 'pace'],
   ['Warm up 10 minutes with jogging and drills (high knees, A-skips, leg swings).', 'Run each rep hard.', 'Walk back to recover fully.'],
   ['Relaxed shoulders, drive the knees'], ['Skipping the warm-up'], ['running', 'speed'])
ex('sprint_then_jog', 'Sprint then jog', 'Running', 'legs, heart and lungs', ['track'], ['distance', 'pace'],
   ['Warm up thoroughly.', 'Sprint the set distance.', 'Go straight into a steady jog for the jog distance.'],
   ['Settle the breathing in the first minute of the jog'], ['Stopping between'], ['running', 'speed', 'endurance'])
ex('treadmill_run', 'Treadmill run', 'Running', 'heart and lungs, legs', ['treadmill'], ['duration', 'distance', 'pace'],
   ['Start with 3 minutes walking.', 'Run at the set pace.', 'Cool down walking.'],
   ['1% incline mimics outdoors'], ['Holding the rails'], ['cardio', 'running'])
ex('stationary_cycle', 'Stationary cycling', 'Cardio', 'legs, heart and lungs', ['cycle'], ['duration'],
   ['Set the saddle at hip height.', 'Pedal at a steady effort.', 'Add resistance as it gets easy.'],
   ['Light grip on the bars'], ['Saddle too low'], ['cardio', 'low-impact'])
ex('outdoor_cycle', 'Outdoor ride', 'Cardio', 'legs, heart and lungs', ['cycle_route'], ['duration', 'distance'],
   ['Check the bike and wear a helmet.', 'Ride at a steady effort.', 'Stay on safe routes.'],
   ['Cadence around 80–90'], ['Riding without lights at night'], ['cardio', 'low-impact'])
ex('skipping', 'Skipping rope', 'Cardio', 'calves, heart and lungs', ['rope'], ['duration'],
   ['Rope length to the armpits.', 'Small jumps on the balls of the feet.', 'Turn from the wrists.'],
   ['Soft landings'], ['Jumping too high'], ['cardio', 'conditioning'])
ex('stair_climb', 'Stair climbing', 'Cardio', 'legs, heart and lungs', ['stairs'], ['duration', 'reps'],
   ['Walk up at a steady pace.', 'Walk down carefully to recover.', 'Repeat.'],
   ['Use the rail if needed'], ['Running down'], ['cardio'])
ex('swim', 'Swimming', 'Cardio', 'whole body, heart and lungs', ['pool'], ['duration', 'distance'],
   ['Warm up with easy lengths.', 'Swim the set at a steady effort.', 'Rest at the wall as needed.'],
   ['Long, relaxed strokes'], ['Holding the breath'], ['cardio', 'low-impact'])
ex('rowing', 'Rowing machine', 'Cardio', 'back, legs, heart and lungs', ['rower'], ['duration', 'distance'],
   ['Legs, then body, then arms.', 'Return arms, body, legs.', 'Steady rhythm.'],
   ['Push with the legs'], ['Pulling with arms first'], ['cardio'])
ex('jumping_jacks', 'Jumping jacks', 'Cardio', 'whole body, heart and lungs', ['none'], ['duration', 'reps'],
   ['Jump feet out while raising the arms.', 'Jump back in.', 'Keep a steady rhythm.'],
   ['Land softly'], ['Locked knees'], ['cardio', 'warm-up'])
ex('burpee', 'Burpee', 'Cardio', 'whole body, conditioning', ['none'], ['reps', 'duration'],
   ['Squat and put the hands down.', 'Jump or step back to a plank, then return.', 'Stand or jump up.'],
   ['Step back instead of jumping to make it easier'], ['Sagging hips in the plank'], ['cardio', 'conditioning'])

# ---------------- Mobility ----------------
ex('cat_cow', 'Cat–cow', 'Mobility', 'spine', ['mat'], ['reps', 'duration'],
   ['On hands and knees.', 'Round the back up, then let it sag gently.', 'Move with the breath.'],
   ['Slow and smooth'], ['Forcing the range'], ['mobility', 'warm-up'])
ex('hip_flexor_stretch', 'Half-kneeling hip flexor stretch', 'Mobility', 'hip flexors', ['mat'], ['duration'],
   ['Kneel on one knee, other foot forward.', 'Squeeze the glute and shift forward.', 'Hold; switch sides.'],
   ['Tuck the pelvis'], ['Arching the back'], ['mobility'])
ex('hamstring_stretch', 'Hamstring stretch', 'Mobility', 'hamstrings', ['mat'], ['duration'],
   ['Lie on your back, one leg up.', 'Hold behind the thigh and straighten gently.', 'Hold; switch.'],
   ['Keep the hips down'], ['Bouncing'], ['mobility'])
ex('thoracic_rotation', 'Open book rotation', 'Mobility', 'upper back', ['mat'], ['reps'],
   ['Lie on your side, knees bent, arms together.', 'Open the top arm across to the other side.', 'Return; switch sides.'],
   ['Follow the hand with your eyes'], ['Knees lifting'], ['mobility'])
ex('worlds_greatest_stretch', "World's greatest stretch", 'Mobility', 'hips, hamstrings, upper back', ['none'], ['reps'],
   ['Lunge forward, hand inside the front foot.', 'Rotate the inside arm to the ceiling.', 'Return; switch sides.'],
   ['Back knee off the floor'], ['Rushing'], ['mobility', 'warm-up'])
ex('deep_squat_hold', 'Deep squat hold', 'Mobility', 'hips, ankles', ['none'], ['duration'],
   ['Sit into the deepest squat you can with heels down.', 'Hold onto something if needed.', 'Breathe.'],
   ['Chest up'], ['Heels lifting'], ['mobility'])
ex('band_shoulder_dislocate', 'Band shoulder pass-through', 'Mobility', 'shoulders', ['band'], ['reps'],
   ['Hold a band wide.', 'Raise it overhead and behind with straight arms.', 'Bring it back.'],
   ['Wider grip = easier'], ['Bending the elbows'], ['mobility', 'shoulders', 'band'])

# ---------------- Archery ----------------
ex('band_bow_draw', 'Band bow-draw hold', 'Skill', 'upper back, rear shoulders, grip', ['band'], ['variation', 'duration'],
   ['Hold the band like a bow, front arm straight.', 'Draw to the corner of the mouth, back elbow high.', 'Hold, then release slowly. Alternate sides.'],
   ['Pull with the back, not the hand'], ['Shrugging the draw shoulder'], ['archery', 'band'])
ex('bow_draw_hold', 'Bow draw and hold', 'Skill', 'upper back, rear shoulders', ['bow'], ['draw', 'duration'],
   ['Draw your bow to anchor with good form.', 'Hold at anchor for the set time.', 'Let down slowly; never dry-fire.'],
   ['Back tension, relaxed hand'], ['Dry-firing the bow'], ['archery'])
ex('archery_practice', 'Archery practice', 'Skill', 'upper back, shoulders, focus', ['bow'], ['shots', 'draw'],
   ['Warm up with band draws.', 'Shoot the set number of arrows with full form.', 'Rest between ends of 6.'],
   ['Same routine every shot'], ['Shooting tired'], ['archery'])
ex('band_external_rotation', 'Band external rotation', 'Strength', 'rotator cuff', ['band'], ['variation', 'reps'],
   ['Elbow at your side, bent 90°.', 'Rotate the hand out against the band.', 'Return slowly.'],
   ['Towel between elbow and ribs'], ['Elbow drifting'], ['shoulders', 'archery', 'band'])

out = os.path.join(os.path.dirname(__file__), '..', 'public', 'data', 'exercises.json')
ids = [e['id'] for e in E]
assert len(ids) == len(set(ids)), 'duplicate ids'
with open(out, 'w') as f:
    json.dump({'version': 1, 'exercises': E}, f, ensure_ascii=False, indent=1)
print(len(E), 'exercises ->', os.path.normpath(out))
