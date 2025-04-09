#!/bin/bash
#SBATCH -n 56
#SBATCH -N 1

# 打印任务信息
echo "Starting job $SLURM_JOB_ID at " `date`
echo "SLURM_SUBMIT_DIR is $SLURM_SUBMIT_DIR"
echo "Running on nodes: $SLURM_NODELIST"

# 执行任务
## 载入lobster
module load lobster
##unlimited the stack size
#ulimit -s unlimited
lobster > lobster.out 2>lobster.err

# 任务结束
echo "Job $SLURM_JOB_ID done at " `date`

